const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Starting manual GitHub Pages deployment...');

// Step 1: Build the project
console.log('📦 Building project...');
execSync('npm run build', { stdio: 'inherit' });

// Step 2: Check if gh-pages branch exists remotely
try {
  execSync('git ls-remote --heads origin gh-pages', { stdio: 'pipe' });
  console.log('✅ gh-pages branch exists on remote');
} catch (e) {
  console.log('ℹ️  gh-pages branch does not exist yet, will be created');
}

// Step 3: Create or checkout gh-pages branch
console.log('🌿 Setting up gh-pages branch...');
try {
  execSync('git checkout gh-pages', { stdio: 'inherit' });
} catch (e) {
  console.log('📝 Creating new gh-pages branch...');
  execSync('git checkout --orphan gh-pages', { stdio: 'inherit' });
  execSync('git rm -rf .', { stdio: 'inherit' });
}

// Step 4: Copy build files to root
console.log('📋 Copying build files...');
const buildDir = path.join(__dirname, 'build');
const files = fs.readdirSync(buildDir);

files.forEach(file => {
  const srcPath = path.join(buildDir, file);
  const destPath = path.join(__dirname, file);
  
  if (fs.statSync(srcPath).isDirectory()) {
    if (fs.existsSync(destPath)) {
      fs.rmSync(destPath, { recursive: true, force: true });
    }
    fs.cpSync(srcPath, destPath, { recursive: true });
  } else {
    fs.copyFileSync(srcPath, destPath);
  }
});

// Step 5: Create .nojekyll file (important for React Router)
fs.writeFileSync('.nojekyll', '');

// Step 6: Add, commit, and push
console.log('💾 Committing changes...');
execSync('git add .', { stdio: 'inherit' });
try {
  execSync('git commit -m "Deploy to GitHub Pages"', { stdio: 'inherit' });
} catch (e) {
  console.log('⚠️  No changes to commit or commit failed');
}

console.log('📤 Pushing to GitHub...');
execSync('git push origin gh-pages --force', { stdio: 'inherit' });

// Step 7: Switch back to main
console.log('🔄 Switching back to main branch...');
execSync('git checkout main', { stdio: 'inherit' });

console.log('✅ Deployment complete!');
console.log('🌐 Your site should be available at: https://crustaly.github.io/nomi');
console.log('⏱️  It may take a few minutes for GitHub Pages to update.');

