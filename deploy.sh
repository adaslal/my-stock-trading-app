#!/bin/bash
clear
echo "=========================================================="
echo "⚡  AEGIS PAVP ONLINE DEPLOYMENT INITIATOR  ⚡"
echo "=========================================================="
echo ""
echo "This script will login to your Google account, compile your"
echo "stock dashboard, and deploy it fully online to Firebase Hosting."
echo ""

# Step 1: Google Account Authentication
echo "👉 STEP 1: Authenticating your Google Firebase account..."
echo "A web browser tab will open automatically. Sign in with your Google account."
echo ""
npx firebase-tools login
if [ $? -ne 0 ]; then
    echo "❌ Error: Google authentication failed. Please try again."
    exit 1
fi

# Step 2: Initialize Project Linkage (if needed)
echo ""
echo "👉 STEP 2: Verifying project connection..."
echo "Please enter your Firebase Project ID (you can find this in your Firebase Web Console):"
read -p "Enter Project ID: " project_id

if [ -z "$project_id" ]; then
    echo "❌ Error: Project ID cannot be empty."
    exit 1
fi

# Update .firebaserc dynamically with the provided project ID
cat << EOF > .firebaserc
{
  "projects": {
    "default": "$project_id"
  }
}
EOF
echo "✅ Project ID linked: $project_id"

# Step 3: Bundle the Dashboard code
echo ""
echo "👉 STEP 3: Compiling latest production React dashboard..."
npm run build
if [ $? -ne 0 ]; then
    echo "❌ Error: Code compilation failed. Please fix syntax."
    exit 1
fi

# Step 4: Deploy live online!
echo ""
echo "👉 STEP 4: Uploading & deploying fully online..."
npx firebase-tools deploy --only hosting
if [ $? -ne 0 ]; then
    echo "❌ Error: Firebase Hosting upload failed."
    exit 1
fi

echo ""
echo "=========================================================="
echo "🎉 SUCCESS! Your PAVP Stock Trading App is live online!"
echo "=========================================================="
echo "Copy your live Web URL displayed above and open it on your"
echo "phone, tablet, iPad, or any device anywhere in the world!"
echo "=========================================================="
echo ""
