# Deploying ProposalIQ to Railway

## Steps

### 1. Create accounts (all free)
- GitHub: https://github.com — create a free account
- Railway: https://railway.app — sign up with your GitHub account

### 2. Push to GitHub
1. Go to https://github.com/new
2. Create a repository called `proposaliq` (private)
3. Upload all these files (drag and drop the folder)

### 3. Deploy on Railway
1. Go to https://railway.app/new
2. Click "Deploy from GitHub repo"
3. Select your `proposaliq` repository
4. Railway will detect it as a Node.js app automatically

### 4. Add environment variables
In Railway, go to your project → Variables → Add these:

```
GEMINI_API_KEY=your_key_here
JWT_SECRET=any_long_random_string_eg_xK9mPqL4nRt7vBw3jH2sT6uE
GEMINI_MODEL=gemini-2.0-flash
NODE_ENV=production
```

### 5. Add a volume (for persistent data)
1. In Railway, go to your service
2. Click "Add Volume"
3. Mount path: `/app/data` — this keeps your database across deployments
4. Add another volume, mount path: `/app/uploads` — keeps uploaded files

### 6. Point your GoDaddy domain
1. In Railway: Settings → Networking → Add Custom Domain
2. Type your domain (e.g. proposals.yourcompany.com)
3. Railway gives you a CNAME value
4. In GoDaddy DNS: Add a CNAME record pointing to that value
5. Wait 10–30 minutes for DNS to update

### 7. First login
Open your domain. You'll see the ProposalIQ setup screen.
Create your admin account — the first account created is automatically the admin.

## Notes
- Your data is stored in Railway's persistent volumes
- Back up the database periodically: Railway → your service → Files
- All team members access via your domain — no install needed on their computers
