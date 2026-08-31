/**
 * TOSS SPORTS — THE ROLE CLAIM
 *
 * Two blocking functions, and without them nothing else works.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS FILE HAS TO EXIST
 *
 * Supabase decides which Postgres role a request runs as by reading the
 * `role` claim out of the JWT. Its own tokens carry role=authenticated.
 * A Firebase token does not carry it at all — Firebase has never heard
 * of Postgres roles.
 *
 * So without this, a signed-in customer's token is accepted as VALID and
 * then executed as `anon`. Every policy written for `authenticated`
 * misses. Every `grant execute … to authenticated` misses. The failure
 * looks exactly like being signed out while the screen says you are
 * signed in — an empty order list, and claim_orders() refusing to run.
 *
 * That is the same shape of failure that made the Maze Room unusable in
 * the Firebase era (PRD C1), which is the reason it is worth spelling
 * out rather than leaving as a line in a README.
 *
 * ─────────────────────────────────────────────────────────────────────
 * TWO FUNCTIONS, NOT ONE
 *
 *   beforeUserCreated   stamps the claim on a brand new account
 *   beforeUserSignedIn  stamps it on every sign-in
 *
 * The second is what covers people who already have accounts in
 * toss-cb8c0 from the original build: they were created long before this
 * file existed, so nothing ever set their claim. It lands the first time
 * they sign in again, with no migration script and nothing to remember.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT IT COSTS
 *
 * Blocking functions need Firebase Authentication with Identity Platform
 * and a project on the Blaze plan. Blaze is pay-as-you-go with a free
 * monthly allowance these two calls will not come close to — but it does
 * require a billing account on the project.
 *
 * ─────────────────────────────────────────────────────────────────────
 * DEPLOY
 *
 *   npm install -g firebase-tools
 *   firebase login
 *   cd firebase-functions && npm install
 *   firebase deploy --only functions --project toss-cb8c0
 *
 * Then sign in on the site and check the claim landed:
 *
 *   select auth.jwt() ->> 'role';     -- must say 'authenticated'
 *   select auth.jwt() ->> 'sub';      -- the Firebase uid
 */

const { beforeUserCreated, beforeUserSignedIn } =
  require('firebase-functions/v2/identity');

/* The claim Supabase reads to pick the Postgres role. The string matters:
   'authenticated' is the role every policy in sql/018 and sql/022 was
   written against. */
const ROLE = { customClaims: { role: 'authenticated' } };

exports.beforecreated  = beforeUserCreated(() => ROLE);
exports.beforesignedin = beforeUserSignedIn(() => ROLE);
