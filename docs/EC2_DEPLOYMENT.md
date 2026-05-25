# SGS EC2 Deployment

This guide deploys the Next.js frontend, FastAPI backend, Nginx reverse proxy, and AWS RDS PostgreSQL database.

## 1. AWS Network Setup

Create or use an EC2 Ubuntu instance and an RDS PostgreSQL instance.

Security group rules:

- EC2 inbound: SSH `22` from your IP.
- EC2 inbound: HTTP port `84` from `0.0.0.0/0` for the website.
- RDS inbound: PostgreSQL `5432` from the EC2 security group only.

You do not need to expose FastAPI port `8004` or Next.js port `3004` publicly when Nginx is used.

## 2. Install Packages On EC2

```bash
sudo apt update
sudo apt install -y git nginx python3-venv python3-pip postgresql-client nodejs npm
node -v
npm -v
```

If the installed Node.js is too old for Next.js 15, install Node.js 20:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

## 3. Clone Or Update Code

```bash
cd /home/ubuntu
git clone https://github.com/Swais-AI/swathi.git
cd /home/ubuntu/swathi
git checkout swati-branch
git pull origin swati-branch
```

## 4. Configure Backend Environment

```bash
cd /home/ubuntu/swathi/backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
nano .env
```

Set `DATABASE_URL` to your AWS RDS endpoint:

```env
DATABASE_URL=postgresql://sgs_app_user:your_password@your-rds-endpoint.ap-south-1.rds.amazonaws.com:5432/sgs_db
CORS_ALLOW_ORIGINS=http://your-ec2-public-ip:84
AI_PROVIDER=mock
```

If using Gemini:

```env
AI_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_key
GEMINI_MODEL=gemini-2.5-flash
GEMINI_BASE_URL=https://generativelanguage.googleapis.com
```

## 5. Create RDS Tables

From the repo root:

```bash
cd /home/ubuntu/swathi
source backend/venv/bin/activate
set -a
source backend/.env
set +a
psql "$DATABASE_URL" -f backend/migrations/000_chapter_content.sql
psql "$DATABASE_URL" -f backend/migrations/001_ai_learning_path.sql
```

If your shell does not know `DATABASE_URL`, run:

```bash
export DATABASE_URL="postgresql://sgs_app_user:your_password@your-rds-endpoint.ap-south-1.rds.amazonaws.com:5432/sgs_db"
```

The chapter endpoint reads from:

```text
sgs_chapter_content
```

The learning profile endpoint reads and writes:

```text
sgs_student_learning_profiles
```

## 6. Configure Frontend Environment

Use Nginx-relative API calls so ports can change behind Nginx:

```bash
cd /home/ubuntu/swathi
cp .env.production.example .env.production
nano .env.production
```

Use:

```env
NEXT_PUBLIC_API_BASE_URL=/api
PORT=3004
```

Build frontend:

```bash
npm ci
npm run build
```

When `NEXT_PUBLIC_API_BASE_URL` changes, run `npm run build` again because this value is compiled into the browser bundle.

## 7. Install systemd Services

```bash
cd /home/ubuntu/swathi
sudo cp deploy/sgs-backend.service /etc/systemd/system/sgs-backend.service
sudo cp deploy/sgs-frontend.service /etc/systemd/system/sgs-frontend.service
sudo systemctl daemon-reload
sudo systemctl enable sgs-backend sgs-frontend
sudo systemctl restart sgs-backend sgs-frontend
```

Check logs:

```bash
sudo systemctl status sgs-backend
sudo systemctl status sgs-frontend
journalctl -u sgs-backend -f
journalctl -u sgs-frontend -f
```

## 8. Configure Nginx

```bash
cd /home/ubuntu/swathi
sudo cp deploy/nginx-sgs.conf /etc/nginx/sites-available/sgs
sudo ln -sf /etc/nginx/sites-available/sgs /etc/nginx/sites-enabled/sgs
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

The sample Nginx config listens on port `84`, sends frontend traffic to `127.0.0.1:3004`, and sends `/api/` traffic to `127.0.0.1:8004`.

## 9. Verify Deployment

On EC2:

```bash
curl http://127.0.0.1:8004/health
curl http://127.0.0.1:8004/health/db
curl "http://127.0.0.1:8004/chapter-content?subject=Social%20Science&lesson=Lesson%201"
curl http://127.0.0.1:3004
curl http://127.0.0.1:84/api/health
```

From your browser:

```text
http://your-ec2-public-ip:84
http://your-ec2-public-ip:84/api/health
http://your-ec2-public-ip:84/api/health/db
```

## 10. Update Deployment Later

```bash
cd /home/ubuntu/swathi
git pull origin swati-branch
npm ci
npm run build
source backend/venv/bin/activate
pip install -r backend/requirements.txt
sudo systemctl restart sgs-backend sgs-frontend
sudo systemctl reload nginx
```
