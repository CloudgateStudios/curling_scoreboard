## [0.7.0](https://github.com/CloudgateStudios/curling_scoreboard/compare/0.6.0...0.7.0) (2026-11-07)

### Features

* API answers can be up to 15 seconds old, and a new API key takes up to a minute to work ([#411](https://github.com/CloudgateStudios/curling_scoreboard/issues/411)) ([3fe4278](https://github.com/CloudgateStudios/curling_scoreboard/commit/3fe4278e090464cee2c79da9fa4297e754e7f104))
* scoreboards lock disconnecting for 15 minutes after 5 wrong admin PINs ([#415](https://github.com/CloudgateStudios/curling_scoreboard/issues/415)) ([ef49f53](https://github.com/CloudgateStudios/curling_scoreboard/commit/ef49f53f8cf664bd6bc0ca551602601955aed756))
* super admins can switch off the API, scores pages, display sign-ins and pairing, and club admins their own API ([#412](https://github.com/CloudgateStudios/curling_scoreboard/issues/412)) ([cd1293a](https://github.com/CloudgateStudios/curling_scoreboard/commit/cd1293a38bee3e44512890b14ae1c9c1273a23dc))
* the API, display sign-ins and pairing limit how often each caller may ask ([#413](https://github.com/CloudgateStudios/curling_scoreboard/issues/413)) ([8c7715c](https://github.com/CloudgateStudios/curling_scoreboard/commit/8c7715c676f045c849412c71f3215093490d5e39))

### Bug Fixes

* API answers are never cached by Hosting's CDN, so one caller's answer never reaches another ([#414](https://github.com/CloudgateStudios/curling_scoreboard/issues/414)) ([914e39e](https://github.com/CloudgateStudios/curling_scoreboard/commit/914e39e22bd4b8036bcfcc254e62362ddae2807c))
* name Firestore's resource type in the monitoring filters ([#410](https://github.com/CloudgateStudios/curling_scoreboard/issues/410)) ([a3fec27](https://github.com/CloudgateStudios/curling_scoreboard/commit/a3fec2766cd85f2b24815d0c08307f564967d962))

