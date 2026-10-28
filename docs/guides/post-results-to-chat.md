# Post results to Slack or Discord

Each finished game can be posted to a channel as it happens. On Discord it
posts quietly, without notifying anyone.
[How it works](../architecture/api-and-webhook.md#completed-game-webhook).

## 1. Get the channel's webhook URL

- **Discord**: in the channel's settings, open **Integrations**, then
  **Webhooks**, make a new webhook and copy its URL.
- **Slack**: add an app with **Incoming Webhooks** turned on to your
  workspace, add a webhook for the channel, and copy its URL.

Their help pages have the current steps. The URL is like a password: anyone
with it can post to the channel.

## 2. Add it to the portal

Open **Settings**, then **Integrations**, and under **Completed Game
Webhook**:

1. Paste the **Webhook URL**.
2. Under **Post**, choose **Every completed game**, **Only league games, where a
   team was picked**, or **Only bonspiel games**.
3. Write the **Message**, or leave the default, such as "Monday Night,
   Sheet 2: Team Smith 7, Team Jones 4". Click a variable to add it, such as
   `{team1}` or `{league}`; the preview shows a sample.
4. Choose the **Time zone for dates and times**.
5. Press **Save**, then **Send Test** and check the channel.

Once saved, the URL is shown masked. **Edit** changes it and **Remove**
turns posting off.

## Checking it worked

Under **Sheets & Games**, a finished game whose post failed is marked, and
expanding it shows why. The settings show how the last post went.

A game is posted once, when it finishes. A scoreboard that was offline posts
its games when it reconnects. A post that fails is not retried later.
