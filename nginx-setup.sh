#!/bin/bash

# Nginx 설정 스크립트
echo "=== Nginx 설정 스크립트 ==="
echo "이 스크립트는 ssurpass.com 도메인을 위한 Nginx 리버스 프록시를 설정합니다."
echo ""

# Nginx 설정 파일 내용
cat > /tmp/ssurpass.com.nginx << 'EOF'
server {
    listen 80;
    server_name ssurpass.com www.ssurpass.com;

    # 클라이언트 최대 업로드 크기
    client_max_body_size 100M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        
        # 실제 클라이언트 IP 전달
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # 타임아웃 설정
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    # WebSocket 지원을 위한 설정
    location /socket.io/ {
        proxy_pass http://localhost:3000/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

echo "Nginx 설정 파일이 준비되었습니다."
echo ""
echo "다음 명령어를 순서대로 실행하세요:"
echo ""
echo "1. Nginx 설치 (이미 설치되어 있다면 생략):"
echo "   sudo apt update && sudo apt install -y nginx"
echo ""
echo "2. 설정 파일 복사:"
echo "   sudo cp /tmp/ssurpass.com.nginx /etc/nginx/sites-available/ssurpass.com"
echo ""
echo "3. 설정 활성화:"
echo "   sudo ln -s /etc/nginx/sites-available/ssurpass.com /etc/nginx/sites-enabled/"
echo ""
echo "4. 기본 설정 비활성화 (선택사항):"
echo "   sudo rm /etc/nginx/sites-enabled/default"
echo ""
echo "5. 설정 테스트:"
echo "   sudo nginx -t"
echo ""
echo "6. Nginx 재시작:"
echo "   sudo systemctl restart nginx"
echo ""
echo "7. Nginx 상태 확인:"
echo "   sudo systemctl status nginx"
echo ""
echo "8. 오라클 클라우드 방화벽에서 80, 443 포트가 열려있는지 확인하세요."