# Deployment Process

## Server Setup

### Prerequisites
- Node.js 18+ LTS
- MongoDB 6.0+
- PM2 for process management
- Nginx for reverse proxy

### Initial Server Setup
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2
npm install -g pm2

# Install Nginx
sudo apt install -y nginx
```

### Application Setup
```bash
# Clone repository
git clone [repository-url]
cd news-summarizer

# Install dependencies
npm install --production

# Setup environment
cp .env.example .env
# Edit .env with production values
```

### Nginx Configuration
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Database Configuration

### MongoDB Setup
```bash
# Install MongoDB
wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
sudo apt update
sudo apt install -y mongodb-org

# Start MongoDB
sudo systemctl start mongod
sudo systemctl enable mongod
```

### Database Security
1. Create admin user
```javascript
use admin
db.createUser({
  user: "admin",
  pwd: "secure_password",
  roles: [ { role: "userAdminAnyDatabase", db: "admin" } ]
})
```

2. Enable authentication in `/etc/mongod.conf`:
```yaml
security:
  authorization: enabled
```

3. Create application database and user
```javascript
use news_summarizer
db.createUser({
  user: "app_user",
  pwd: "app_password",
  roles: [ { role: "readWrite", db: "news_summarizer" } ]
})
```

## Monitoring Setup

### Application Monitoring

1. PM2 Setup
```bash
# Start application with PM2
pm2 start npm --name "news-summarizer" -- start
pm2 save

# Enable PM2 monitoring
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

2. Prometheus Setup
```bash
# Install Prometheus
wget https://github.com/prometheus/prometheus/releases/download/v2.37.0/prometheus-2.37.0.linux-amd64.tar.gz
tar xvfz prometheus-*.tar.gz
cd prometheus-*

# Configure Prometheus
cat > prometheus.yml << EOF
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'news_summarizer'
    static_configs:
      - targets: ['localhost:3000']
EOF

# Start Prometheus
./prometheus --config.file=prometheus.yml
```

3. Grafana Setup
```bash
# Install Grafana
sudo apt-get install -y software-properties-common
sudo add-apt-repository "deb https://packages.grafana.com/oss/deb stable main"
wget -q -O - https://packages.grafana.com/gpg.key | sudo apt-key add -
sudo apt-get update
sudo apt-get install grafana

# Start Grafana
sudo systemctl start grafana-server
sudo systemctl enable grafana-server
```

### Alert Configuration
1. Set up Grafana alerts for:
   - High CPU usage (>80%)
   - High memory usage (>85%)
   - API response time > 2s
   - Error rate > 1%
   - Failed scraping attempts

2. Configure alert notifications via:
   - Email
   - Slack
   - PagerDuty

## Update Procedures

### Application Updates
```bash
# Pull latest changes
git pull origin main

# Install dependencies
npm install --production

# Run database migrations
npm run migrate

# Restart application
pm2 restart news-summarizer
```

### Database Updates
1. Backup before updates
```bash
mongodump --db news_summarizer --out /backup/$(date +%Y%m%d)
```

2. Apply schema changes
```bash
npm run migrate
```

### System Updates
```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Restart services if needed
sudo systemctl restart nginx
sudo systemctl restart mongod
```

## Backup Strategy

### Database Backups

1. Daily automated backups
```bash
# Create backup script
cat > /usr/local/bin/backup-db.sh << EOF
#!/bin/bash
BACKUP_DIR="/backup/mongodb"
DATE=$(date +%Y%m%d)
mongodump --db news_summarizer --out $BACKUP_DIR/$DATE
find $BACKUP_DIR -type d -mtime +7 -exec rm -rf {} +
EOF

chmod +x /usr/local/bin/backup-db.sh

# Add to crontab
echo "0 1 * * * /usr/local/bin/backup-db.sh" | crontab -
```

2. Backup verification
```bash
# Create verification script
cat > /usr/local/bin/verify-backup.sh << EOF
#!/bin/bash
BACKUP_DIR="/backup/mongodb"
LATEST_BACKUP=$(ls -t $BACKUP_DIR | head -1)
mongorestore --db test_restore $BACKUP_DIR/$LATEST_BACKUP/news_summarizer
EOF

chmod +x /usr/local/bin/verify-backup.sh
```

### Application Backups
1. Code repository backup
2. Environment configuration backup
3. Nginx configuration backup

## Scaling Considerations

### Horizontal Scaling
1. Load Balancer Setup
```nginx
upstream news_summarizer {
    server 127.0.0.1:3000;
    server 127.0.0.1:3001;
    server 127.0.0.1:3002;
}

server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://news_summarizer;
    }
}
```

2. MongoDB Replication
```javascript
// Initialize replica set
rs.initiate({
  _id: "news_summarizer_rs",
  members: [
    { _id: 0, host: "mongodb1:27017" },
    { _id: 1, host: "mongodb2:27017" },
    { _id: 2, host: "mongodb3:27017" }
  ]
})
```

### Vertical Scaling
1. Resource Monitoring
2. Performance Optimization
3. Caching Strategy

### Caching Strategy
1. Redis Setup
```bash
# Install Redis
sudo apt install redis-server

# Configure Redis
sudo sed -i 's/supervised no/supervised systemd/' /etc/redis/redis.conf
sudo systemctl restart redis
```

2. Implementation
```javascript
// Cache configuration
const CACHE_TTL = {
  articles: 300,  // 5 minutes
  summary: 600    // 10 minutes
};
```

### Rate Limiting
```javascript
// Configure rate limiting
const rateLimit = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
};
```

## Security Considerations

1. SSL/TLS Configuration
```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Obtain SSL certificate
sudo certbot --nginx -d your-domain.com
```

2. Firewall Setup
```bash
# Configure UFW
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

3. Security Headers
```nginx
# Add security headers
add_header X-Frame-Options "SAMEORIGIN";
add_header X-XSS-Protection "1; mode=block";
add_header X-Content-Type-Options "nosniff";
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains";
