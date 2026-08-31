# The role claim

Two Firebase blocking functions. **Nothing about customer accounts works
without them**, and the way it fails is quiet.

---

## The problem they solve

Supabase picks the Postgres role for a request by reading the `role` claim
out of the JWT. Its own tokens carry `role=authenticated`. **A Firebase
token does not carry it at all** — Firebase has never heard of Postgres
roles.

So without these functions, a signed-in customer's token is accepted as
perfectly valid and then executed as `anon`:

- every policy written for `authenticated` misses
- every `grant execute … to authenticated` is refused
- `link_my_history()` and `claim_orders()` will not run

What you see is an account page that says you are signed in, with an empty
order list. Nothing errors. That is the same shape as PRD **C1**, which is
why it is written down here rather than left as a footnote.

---

## Deploy

Requires Firebase Authentication **with Identity Platform**, and the
project on the **Blaze** plan — blocking functions are not available on
Spark. Blaze is pay-as-you-go with a free monthly allowance these two
calls will not come near, but it does need a billing account on the
project.

```bash
npm install -g firebase-tools
firebase login
cd firebase-functions && npm install
firebase deploy --only functions --project toss-cb8c0
```

---

## Why two functions

| Function | Covers |
|---|---|
| `beforeUserCreated` | brand new accounts |
| `beforeUserSignedIn` | **everyone, on every sign-in** |

The second is the one that matters for `toss-cb8c0`. It already has users
from the original build, created long before this file existed, so nothing
ever set their claim. `beforeUserSignedIn` lands it the first time they
sign in again — no migration script, nothing to remember.

Supabase's own documentation suggests an Admin SDK script to backfill
existing users instead. That works too, but it is a one-off you have to
run and then never forget; a sign-in hook covers the same people and keeps
covering anyone restored from a backup later.

---

## Check it worked

Sign in on the site, then in the Supabase SQL editor **as that user**:

```sql
select auth.jwt() ->> 'role' as role,   -- must be 'authenticated'
       auth.jwt() ->> 'sub'  as firebase_uid,
       auth.jwt() ->> 'phone_number' as verified_phone;
```

If `role` is null or `anon`, the functions are not deployed or the token
predates them — sign out and back in, which is what triggers
`beforeUserSignedIn`.

The site checks this for you too: `checkFirebaseWiring()` in
`js/firebase-auth.js` runs before anything else uses the network and says
so plainly rather than showing an empty account.
