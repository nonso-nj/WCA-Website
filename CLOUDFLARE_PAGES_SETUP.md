# GitHub and Cloudflare Pages setup

This project is a plain static website (HTML, CSS, JavaScript, JSON, and one small logo file). There is no framework, package manager, build script, server-side code, or current environment-variable requirement.

## Cloudflare Pages build settings

When importing the GitHub repository as a Pages project, use:

| Setting | Value |
|---|---|
| Framework preset | None / no framework |
| Production branch | `main` |
| Root directory | `/` (repository root; leave default) |
| Build command | `exit 0` (no-op; the site does not compile) |
| Build output directory | `.` (the repository root, where `index.html` is located) |
| Environment variables | None |

Cloudflare’s general build instructions permit leaving the build command blank when no build is required. Its static HTML guide recommends `exit 0` for a no-build project; use that value if the setup form requires a command. No secrets or application environment variables are needed. Cloudflare’s own Pages build variables are injected automatically.

## Prepare and push to GitHub

1. Create a new empty repository in the church-owned GitHub organization. Do not initialize it with a README, license, or .gitignore; those files are already local.
2. From this project directory, check `git status` and confirm the intended files are present.
3. Stage and commit the project:

   ```powershell
   git add .
   git commit -m "Initial WCA website draft"
   ```

4. Connect the repository URL supplied by GitHub and push the `main` branch:

   ```powershell
   git remote add origin https://github.com/CHURCH-ORG/REPOSITORY.git
   git push -u origin main
   ```

Replace the URL with the church-owned repository address. GitHub may ask you to authenticate through its normal browser/device flow. Do not put a password or personal access token directly in a remote URL or project file.

## Connect Cloudflare Pages to GitHub

1. In the church-owned Cloudflare account, open **Workers & Pages** and choose **Create application** → **Pages** → **Import an existing Git repository**.
2. Authorize access to the church repository, select it, then enter the build settings above.
3. Review the project name, production branch, and settings before selecting the dashboard’s deploy action. Deployment has not been started by this preparation.
4. After the first preview is available, review all pages and links. Add the live custom domain only after the church approves the public release and the DNS owner is ready.

## Local preparation status

- `.gitignore` excludes environment files, local Cloudflare files, and the workspace `work/` and `outputs/` folders.
- The project contains no `.env` files, detected credential values, contact email strings, member records, or files above 10 MB. The largest file at inspection was the supplied logo (about 60 KB).
- No repository remote or Cloudflare project has been configured by this guide.
