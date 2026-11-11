# Name your streams

A streaming tool that runs a YouTube stream on each sheet can ask the API
what is on the sheet and get a title and description for it, so nobody has
to type one. [How it works](../architecture/api-and-webhook.md#what-is-on-a-sheet-now).

## 1. Set the club's time zone

Open **Settings**, then **Club**. Under **Time Zone**, choose where
the club is and press **Save**. League and bonspiel times are in this zone,
and the API needs it to tell what is on now. It starts on your own zone.

## 2. Give the tool the API key

Under **API Key**, copy the key into the streaming tool. The tool asks for
each sheet's stream at:

```
GET /api/v1/clubs/{clubId}/sheets/{sheetId}/now
```

**Stream Titles**, below, shows this address with your club's ID filled in,
and a sheet's ID is in the address of its games in the portal. The answer names
the league or bonspiel game on the sheet, and its teams once the game has
started on the scoreboard, so the tool should ask again a few minutes in.

If the tool misbehaves, for example asking over and over, clear **Turn on
the API** below the key. Every tool using the key then gets an error until
you tick it again, and the key stays the same. Either change takes up to a
minute.

## 3. Word the titles, if you like

Under **Stream Titles**, pick **League**, **Bonspiel** or **Nothing
scheduled**, and change the **Title** or **Description**. Click a variable to
add it where the cursor is. Put a part in square brackets to leave it out
until everything in it is known:

```
{league} · {sheet}[ · {matchup}]
```

shows "Monday Night · Sheet 2" before the teams are picked, and adds "· Team
Smith v Team Jones" once they are. The previews show both. YouTube titles are
up to 100 characters, and the portal warns when one could be longer.

Press **Save**. **Reset to default** puts one kind back as it was.
