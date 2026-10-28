# Club management proposal

<!-- cspell:ignore Capterra Squarespace waitlist waitlists -->

Draft for discussion · October 27, 2026

## Product direction

Grow the platform from scoreboards, leagues and bonspiels into the tool a club
runs its season with: memberships and dues, league registration, Learn to
Curls and other events, private rentals, and the payments for all of them.
The aim is to replace Curling Club Manager (CCM) at the pilot club for the
season starting July 2027, then offer it to other clubs.

Decisions so far:

- **Pilot, then sell.** The owner's club in Illinois first, then a few more,
  some of them out of state.
- **Clubs bring their own Stripe account.** A club connects the Stripe
  account it already has, or opens one itself. Money goes straight to the
  club, and the platform is never in between.
- **One login, each club's data kept apart.** A curler signs in once and can
  belong to several clubs, but each club sees only its own record of them.
- **All four areas are in scope:** membership and dues, league registration,
  Learn to Curls and events, and private rentals, plus volunteer tracking
  from CCM.
- **Start fresh.** No history moves over from CCM, only contacts so members
  can be invited.
- **The club keeps its own website** (Squarespace or similar) for July 2027,
  with the platform's registration, calendar and results embedded in it. A
  built-in club site can come later.
- **The scoreboard stays free.** It is how clubs find the platform.
- **Pricing is a small subscription plus a small fee on payments**, priced to
  come in under the $500 a year the pilot club pays CCM, and each club
  decides who pays card fees.
- **Registration opens in July 2027.** That is the deadline.
- **Built part-time by the owner.** An LLC is planned but not formed yet.

## What replacing CCM takes

The pilot club uses CCM for its website, all its league management (sign-ups,
payments, schedules and results) and volunteer hours. To replace it, the club
needs:

1. **Registration and payments** for memberships, leagues, Learn to Curls and
   events, by July 2027.
2. **A public website**: the club's own site, with the platform's widgets, by
   July 2027.
3. **Volunteer tracking**: requirements set with memberships in July, hours
   logged through the season.
4. **League schedules**: dated games and sheet assignments, by the fall.
5. **Standings and public results**, by the fall.

Items 4 and 5 are releases 3 to 5 of the
[feature roadmap](FEATURE_ROADMAP_PROPOSAL.md). They move from "eventually"
to required, though they are needed when leagues start in the fall, a few
months after registration opens.

## What is already built

The data is already split by club: everything lives under `clubs/{clubId}`,
and `firestore.rules` with custom claims keeps clubs apart. Leagues have
teams and weekly draws; bonspiels have events, draws, games, pools and
standings, with results coming in from scoreboards. Cloud Functions already
do anything a browser can't be trusted with, which is the same pattern
payment webhooks need. Members can already follow every sheet on the public
scores page, with no account. See [FEATURES](FEATURES.md) and
[ARCHITECTURE](ARCHITECTURE.md).

Missing:

- Any notion of a **person**. Teams are names, and admins are the only
  accounts.
- Money, orders, refunds, waivers, consent, and anything for minors.
- A screen for members that knows who they are. The admin portal is for
  staff, the scoreboard is for the ice, and the public scores page is the same
  for everyone.

## Technical plan

### People and keeping clubs apart

- A top-level `users/{uid}` holds identity only: name, email and how they
  sign in. Nothing about any club.
- `clubs/{clubId}/members/{memberId}` is the club's own record of a person:
  memberships, emergency contact, waivers, notes. It is linked to a `uid`
  once the person claims it, so a club can invite members who have no
  account yet. A curler at two clubs has two member records, and neither club
  can see the other's.
- Rules let a member read their own record by `uid` and staff read only their
  own club. No query a browser can run reaches across clubs.
- Super admin access to member data is a logged, deliberate action rather
  than standing access.
- New staff roles next to club admin: registrar, treasurer, league
  coordinator and event coordinator.

### Juniors

The pilot club has junior curlers, so these are in the first release:

- A guardian account manages a child's member record, signs their waivers and
  pays for them.
- Junior pricing and eligibility by age on a cutoff date.
- A medical and emergency contact that only the program's coaches can see.
- Optionally, coaches' SafeSport certification and when it expires.

### One model for everything sold

League registration, Learn to Curls, clinics, bonspiel entries, memberships
and rentals are all one thing, an **offering**:

- A price or a choice of prices, including member and junior prices.
- Capacity and a waitlist.
- Eligibility: members only, a Learn to Curl done first, an age range.
- A registration form, the waivers it needs, and dates it opens and closes.

So there is one checkout, one roster screen and one refund flow rather than
four. A finished league registration becomes a team in the league's `teams`,
and a bonspiel entry a team in the bonspiel's. That joins **registration,
schedule, scoreboard and results** in one place, which no curling club tool
does today.

### Payments

- **Clubs bring their own Stripe account**, connected to the platform with
  Stripe Connect as a Standard account. The account stays the club's: its
  dashboard, its bank account, its payouts, disputes and tax forms, with
  Stripe's pricing agreed between the club and Stripe. The club can
  disconnect at any time. Charges are made on the club's account, so money
  never passes through the platform, and the platform pays no Connect fees.
- **Not API keys.** Asking clubs to paste their Stripe secret keys in would
  avoid Connect, but the platform would then hold keys that can move a club's
  money, with no clean way to take that access back. Connect gives the
  platform only what it needs and is what Stripe recommends.
- **The platform fee is an application fee on each charge.** Stripe deducts
  it and shows it in the club's dashboard, so it is automatic and there are no
  invoices to chase. A refund can return the fee with it.
- **Stripe Checkout or Payment Element**, so card details never reach the
  platform and its card security paperwork stays at the lightest level.
- **Bank transfer (ACH) for dues** as well as cards. About 0.8% capped at $5
  against 2.9% + 30¢, which saves about $12 on a $600 membership.
- **Payment plans** for dues.
- An orders and payments record in Firestore, filled in from Stripe webhooks.
  Stripe is the source of truth.
- Card fees: the club chooses for each offering whether to absorb them or
  add them at checkout.

### Volunteer tracking

- **Opportunities and shifts**: ice crew, bar, Learn to Curl instructors,
  bonspiel help, each with dates, places and how many people it needs.
- **Sign-up** by members, and reminders before a shift.
- **Hours** logged from a shift, or added by the member for work outside one,
  and approved by staff.
- **Requirements** set by membership type, such as 10 hours a season, with an
  optional buy-out fee the member pays at renewal or once the season ends.
  This uses the same checkout as everything else.
- **Reports**: hours by member against their requirement, and who still owes
  hours or a buy-out.

### Embedded widgets

The club's own website embeds the platform's pages:

- Upcoming Learn to Curls and events, with registration.
- League registration and the season calendar.
- League schedules, standings and results, and live scores.

These need to look at home on a Squarespace or WordPress site, follow the
club's colors, and work on a phone. Live scores can build on the public scores
page. They load from the platform, so a club
that later moves to a built-in site keeps the same pages.

### Everything else

- Transactional email (Postmark or Resend): receipts, waitlist offers,
  renewal reminders, invitations to claim an account.
- Waivers with versions, an e-signature, and a record of when, from where and
  which text was signed.
- A contact import (name, email, phone, guardian) to invite members.
- A roster export for USA Curling and regional association dues.
- Reports from Firestore and CSV exports at first; an export to BigQuery if
  that becomes slow or costly.

## UX

### Members and the public

A new mobile-first web app for members and the public, separate from the
admin portal, which the widgets come from.

- **Newcomer:** finds a Learn to Curl on the club's site, checks out as a
  guest with just an email, and signs the waiver on the way. Afterwards, they
  are invited to make an account and offered a newcomer membership.
- **Returning member:** a "Renew for 2027–28" card with last season's choices
  already picked, a few taps in all. League sign-up as a full team, part of a
  team (inviting teammates by email) or an individual, and a spares list.
- **Guardian:** sees each child, and registers and pays for them in the same
  checkout.
- **Volunteer:** sees their hours against the requirement, and signs up for
  open shifts from the same page.
- **My curling:** upcoming games from the league schedules, receipts,
  waivers, volunteer shifts, and teams across all of a curler's clubs. This is
  the only place clubs come together, and only because it is the curler's
  own.

### Staff, in the admin portal

- A season setup wizard: copy last season's offerings, then change dates and
  prices.
- A registration dashboard: how full each offering is, waitlists, unpaid
  balances.
- A refund or credit in one step, and moving a curler between leagues.
- A team builder that pairs individual sign-ups into teams and adds them to
  the league.
- Volunteers: post shifts, approve hours, and see who is short of their
  requirement.
- Rentals: an inquiry inbox, a quote that becomes a deposit link, and booked
  sheets blocked on the calendar.

## Timeline

Worked back from registration opening in July 2027, part-time. These are
targets for discussion, not commitments.

| When | Work | Result |
| --- | --- | --- |
| Nov–Dec 2026 | LLC, Stripe platform account; accounts, member records, guardians, staff roles; offerings, checkout, waivers, email | Foundations |
| Jan–Mar 2027 | Learn to Curls, clinics and spring events with real payments at the pilot club | A low-stakes first run of payments |
| Mar–May 2027 | Memberships, dues, payment plans, league registration, waitlists, team builder; volunteer requirements and buy-outs; contact import; widgets | Registration built |
| Jun 2027 | Staff set up the 2027–28 offerings; test with a few members; account invitations go out | Ready to open |
| Jul 2027 | Registration and renewals open; support for the pilot club | Live |
| Jul–Sep 2027 | League schedules and sheet assignments, standings, public results (roadmap releases 3–5); volunteer shifts and hours; rentals | Ready for leagues in the fall |

If time runs short, these slip in order: rentals (a quote and a payment link
meanwhile), volunteer shift sign-up (staff log hours instead), payment plans,
then the team builder (coordinators pair individuals by hand). Payments,
waivers, guardians and registration cannot slip.

## Costs

| Item | Rough cost | Notes |
| --- | --- | --- |
| Firebase | $5–30 a month for the pilot | Grows slowly; reads are most of it |
| Transactional email | About $15–20 a month | Starter plans |
| Stripe Connect, clubs' own accounts | Nothing to the platform | Clubs pay Stripe's processing, or pass it on |
| Stripe Tax, optional | 0.5% of taxed payments | For the platform's own invoices once out-of-state clubs sign |
| Illinois LLC | About $150 to form, $75 a year | Confirm with the Secretary of State |
| Cyber and professional liability insurance | About $500–1,500 a year | Before real member data arrives |
| Terms of service, privacy policy, data agreement with clubs | About $1–3k once, or templates | Clubs expect a data agreement |

About $2.5–5k a year before the owner's time. Support around registration
windows is the real cost.

## Tax

Not tax advice; confirm with an accountant.

- **The platform's subscription.** Illinois generally doesn't tax software
  sold as a service, but Chicago's tax on leased cloud software can apply to
  a club in the city. Several other states do tax it, so out-of-state clubs
  need tax on their invoices.
- **What clubs sell.** Dues and leagues are usually untaxed, merchandise is
  taxable, and some cities tax paid participation as an amusement. Clubs set
  tax for each offering and are responsible for collecting it.

## Pricing

The nearest anchor is Curling I/O: free for its core features, earning a share
of card fees, or about $420 a year flat for a club that doesn't take payments
online ([GetApp](https://www.getapp.com/recreation-wellness-software/a/curling-io/),
[Capterra](https://www.capterra.co.uk/software/1086364/Curling-IO)). CCM's
pricing isn't public, but the pilot club pays **$500 a year**, website
included.

To win, a club's own cost has to come in under that, counting the website it
now pays for separately (about $200–280 a year on Squarespace). So the
subscription stays small and the fee on payments does most of the work, shown
to members at checkout by default:

| Plan | Members | Subscription | Fee on online payments |
| --- | --- | --- | --- |
| Scoreboard | Any | Free | None |
| Club | Up to 400 | $200 a year | 0.5%, at most $3 a payment |
| Club | Over 400 | $350 a year | The same |

- **The club's cost:** a 250-member club pays $200 plus about $240 for its
  website, **about $440 a year**, under the $500 it pays CCM.
- **The members' cost:** the fee adds at most $3 to a payment, $3 on a $600
  membership and about 50¢ on a $100 Learn to Curl. A club can absorb it
  instead, which adds roughly $600 a year for a club taking $150k online.
- **The platform's income** from that club: $200 plus about $600 in fees,
  **about $800 a year**.
- **The pilot club** pays nothing for the 2027–28 season, then a founding
  price held for two years.
- Four to six clubs cover the running costs. It takes roughly 40–60 for the
  work to pay for meaningful time. With a couple of hundred US clubs, many of
  them small, this is a sustainable side business unless Canada comes later.

## Open questions

1. How many members does the pilot club have, and how much does it take in
   online each year? That checks the pricing against a real club.

Sources:
[Stripe Connect pricing](https://stripe.com/connect/pricing),
[Curling I/O on GetApp](https://www.getapp.com/recreation-wellness-software/a/curling-io/),
[Curling I/O on Capterra](https://www.capterra.co.uk/software/1086364/Curling-IO).
