<!-- BEGIN:deployment-branch-rule -->
# Deployment Branch Policy
For all future tasks in this workspace, ALWAYS push code changes exclusively to the `deployment` branch. Do NOT push to the `main` branch unless explicitly instructed otherwise by the user.

- When committing and pushing changes, use:
  ```bash
  git checkout deployment
  git add <files>
  git commit -m "..."
  git push origin deployment
  ```
<!-- END:deployment-branch-rule -->
