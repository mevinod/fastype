# Deployment (Same EC2, Different Nginx Path)

Fastype is deployed on the existing EC2 and exposed via an nginx path, e.g. `https://mevinod.com/fastype/`.

## 1. Required GitHub Secrets

- `SSH_HOST`
- `SSH_PORT`
- `SSH_PRIVATE_KEY`
- `USER_NAME`
- `FASTYPE_APP_DIR` (example: `/var/www/fastype`)
- `FASTYPE_SERVICE_NAME` (example: `fastype`)

## 2. Server Preparation

1. Create app directory:
   `sudo mkdir -p /var/www/fastype && sudo chown -R $USER:$USER /var/www/fastype`
2. Create a systemd unit (example):

```ini
[Unit]
Description=Fastype service
After=network.target

[Service]
Type=simple
WorkingDirectory=/var/www/fastype
Environment=NODE_ENV=production
Environment=PORT=4173
Environment=BASE_PATH=/fastype
ExecStart=/usr/bin/node server.js
Restart=always
User=ubuntu

[Install]
WantedBy=multi-user.target
```

3. Enable service:
   `sudo systemctl daemon-reload && sudo systemctl enable fastype && sudo systemctl start fastype`

## 3. Nginx Path Setup

Add the block from `deploy/nginx/fastype.conf` into your existing nginx server config for `mevinod.com`, then:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 4. CI/CD Flow

On push to `main/master`:
1. CI runs `npm ci` and syntax checks.
2. Workflow rsyncs code to `FASTYPE_APP_DIR`.
3. Remote host runs `npm ci --omit=dev`.
4. Workflow restarts Fastype service and reloads nginx.
