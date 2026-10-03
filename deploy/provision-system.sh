#!/bin/bash
# system.wordsense.kr — Design Studio(정적 앱) 배포: CF DNS → 사이트+SSL → git clone → 권한
# provision-calc.sh 패턴에서 WP/DB 단계를 뺀 정적 버전
set -u
LOG=/root/provision-system-$(date +%s).log
exec > >(tee -a "$LOG") 2>&1

DOMAIN_ROOT=wordsense.kr
IP=49.247.206.163
D="system.$DOMAIN_ROOT"
DOCROOT="/home/$D/public_html"
REPO="https://github.com/yester21/kdr-dgn-system.git"

echo "### 1. Cloudflare DNS (grey cloud)"
CFINFO=$(cat /root/wp-templates/cf-token.txt)
CFTOKEN=$(echo "$CFINFO" | grep -oE 'token[=:] ?[A-Za-z0-9_-]+' | head -1 | grep -oE '[A-Za-z0-9_-]+$')
CFZONE=$(echo "$CFINFO" | grep -oE 'zone_id[=:] ?[a-f0-9]+' | head -1 | grep -oE '[a-f0-9]+$')
EXISTS=$(curl -s -H "Authorization: Bearer $CFTOKEN" "https://api.cloudflare.com/client/v4/zones/$CFZONE/dns_records?name=$D" | grep -c '"id"')
if [ "$EXISTS" -gt 0 ]; then echo "DNS $D already exists"; else
  curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$CFZONE/dns_records" \
    -H "Authorization: Bearer $CFTOKEN" -H "Content-Type: application/json" \
    --data "{\"type\":\"A\",\"name\":\"$D\",\"content\":\"$IP\",\"ttl\":3600,\"proxied\":false}" \
    | grep -q '"success":true' && echo "DNS $D created" || echo "DNS $D FAILED"
fi

echo "### 2. CyberPanel site + SSL"
if [ -d "/home/$D" ]; then echo "site $D already exists"; else
  cyberpanel createWebsite --package Default --owner admin --domainName "$D" --email yester21@gmail.com --php 8.4 --ssl 1 --dkim 0 --openBasedir 0 || true
fi
sleep 3
[ -d "$DOCROOT" ] && echo "docroot OK" || echo "docroot MISSING"
ls /etc/letsencrypt/live/$D >/dev/null 2>&1 || { cyberpanel issueSSL --domainName "$D" || true; sleep 5; }
ls /etc/letsencrypt/live/$D >/dev/null 2>&1 && echo "ssl OK" || echo "ssl PENDING"

echo "### 3. 앱 배포 (git clone → rsync)"
rm -rf /root/kdr-dgn-system
git clone --depth 1 "$REPO" /root/kdr-dgn-system || { echo "CLONE FAILED"; exit 1; }
mkdir -p "$DOCROOT"
# CyberPanel 기본 잔여물 정리 (.well-known은 SSL 갱신용 보존)
find "$DOCROOT" -maxdepth 1 -mindepth 1 ! -name '.well-known' -exec rm -rf {} + 2>/dev/null || true
rsync -a --exclude '.well-known' --exclude '.git' /root/kdr-dgn-system/ "$DOCROOT/"
SITEUSER=$(stat -c %U "$DOCROOT")
chown -R "$SITEUSER:$SITEUSER" "$DOCROOT"
echo "docroot 내용:"; ls "$DOCROOT"

echo "### 4. 서버 로컬 검증"
curl -sk "https://127.0.0.1/" -H "Host: $D" -o /dev/null -w "https(local): %{http_code}\n"
curl -sk "https://127.0.0.1/js/app.js" -H "Host: $D" -o /dev/null -w "app.js(local): %{http_code}\n"
echo "### 완료"
