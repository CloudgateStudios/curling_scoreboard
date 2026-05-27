# Curling Scoreboard

A simple Curling Scoreboard, written in Flutter, meant to be used in any curling club that has an electronic scoreboard.

## Project Setup

This project is a basic [Flutter](http://www.flutter.dev) application so [environment setup](https://docs.flutter.dev/get-started/install) can be found and followed on the main Flutter developer site.

After cloning the repo and opening the project in [VSCode](https://code.visualstudio.com/) you should be able to run the `Launch Web` target to see everything up and working.

## Deployments

### PR Previews

When a pull request is opened, the [validate_pr](https://github.com/CloudgateStudios/curling_scoreboard/actions/workflows/validate_pr.yaml) workflow runs all checks (code, formatting, tests, spelling). Once all checks pass, a preview build is automatically deployed to a temporary Firebase Hosting channel named after the branch. Previews expire after 10 days and a link is posted directly on the PR.

### Dev System

Any push to `main` automatically triggers the [deploy_web_dev](https://github.com/CloudgateStudios/curling_scoreboard/actions/workflows/deploy_web_dev.yaml) workflow, which builds and deploys to the live dev environment.

### Prod System

You first need to do ensure you have a new tagged version. This is handled by the [version_increment](https://github.com/CloudgateStudios/curling_scoreboard/actions/workflows/version_increment.yaml) workflow. This will automatically read the commits, create the [changelog](https://github.com/CloudgateStudios/curling_scoreboard/blob/main/docs/CHANGELOG.md) and [release notes](https://github.com/CloudgateStudios/curling_scoreboard/blob/main/docs/RELEASE_NOTES.md) and commit it all back to the `main` branch.

Production deploys are manual. Go to the [deploy_web_prod](https://github.com/CloudgateStudios/curling_scoreboard/actions/workflows/deploy_web_prod.yaml) action, click "Run Workflow", and enter the version tag to deploy (e.g. `0.0.34`). The workflow checks out that exact tag and deploys it to the live prod environment.
