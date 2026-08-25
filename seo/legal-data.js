/* ============================================================
   TOSS — POLICY PAGES

   NOT LEGAL ADVICE. These are drafted to match how Toss actually
   operates and to satisfy what a payment gateway asks for at
   onboarding. Have someone qualified read them before you rely
   on them.

   Every number below is a business decision, not a legal
   constant. These are the ones to confirm before publishing:

     · RETURN_DAYS      — days from delivery to raise a problem
     · REFUND_DAYS      — working days to return the money
     · DISPATCH_DAYS    — bench time before a bat ships
     · DELIVERY_DAYS    — courier time after dispatch
     · what is non-returnable (currently: made-to-order,
       engraved and custom items, which is normal and fair —
       they cannot be resold)

   Deliberately NOT written here, because inventing them would be
   worse than leaving them out:
     · GSTIN — none supplied yet, so no tax registration is
       claimed anywhere
     · company registration type or number
     · opening hours
   ============================================================ */

const RETURN_DAYS   = 7;
const REFUND_DAYS   = '5–7';
const DISPATCH_DAYS = '2–4';
const DELIVERY_DAYS = '3–7';

const LEGAL = {

  'privacy-policy': {
    h1: 'Privacy Policy',
    title: 'Privacy Policy',
    desc: 'What Toss Sports collects when you order or enquire, why we hold it, who sees it, and how to have it removed.',
    updated: 'This policy was last updated when the site was published.',
    body: [
      ['What we collect', `
        <p>When you place an order or send an enquiry we ask for your name, phone number,
        delivery address and, where you give one, an email address. When you send photos
        for a repair, trade-in or custom bat, we hold those photos.</p>
        <p>We do not ask for and never store card numbers, UPI IDs, bank details or
        passwords. If you pay online, the payment provider handles that on their own
        systems and we never see it.</p>`],
      ['Why we hold it', `
        <p>To make and deliver what you ordered, to reply to you, to raise an invoice, and
        to keep the records a business is required to keep. Nothing else.</p>`],
      ['Who sees it', `
        <p>Toss staff who need it to do the work — the bench, the person packing, the
        person replying to you. Beyond that, only the couriers who deliver your order and
        the services that run this site (our database host and, when online payment is
        enabled, the payment provider).</p>
        <p>We do not sell your information. We do not share it for anyone else's
        advertising.</p>`],
      ['WhatsApp', `
        <p>Most of our conversations happen on WhatsApp, because that is how our customers
        prefer to reach us. Those messages sit in WhatsApp, under
        <a href="https://www.whatsapp.com/legal/privacy-policy" rel="nofollow noopener"
        target="_blank">their privacy policy</a>, not ours.</p>`],
      ['How long we keep it', `
        <p>Order and invoice records are kept as long as the law requires us to keep
        business records. Enquiries that do not become orders, and the photos attached to
        them, are removed once the conversation is finished and there is no reason to
        keep them.</p>`],
      ['Your choices', `
        <p>Write to us and we will tell you what we hold about you, correct anything
        wrong, or delete it where we are not required to keep it. Ask us to stop
        messaging you and we will stop.</p>`],
      ['Children', `
        <p>We sell bats that children use, and we are glad of it — but the order should be
        placed by a parent or guardian. We do not knowingly collect information directly
        from a child.</p>`],
      ['Contact', `
        <p>Email <a href="mailto:contact@tossports.in">contact@tossports.in</a> or call
        <a href="tel:+918939981055">+91 89399 81055</a>.</p>`]
    ]
  },

  'terms': {
    h1: 'Terms & Conditions',
    title: 'Terms & Conditions',
    desc: 'The terms you agree to when you order from Toss Sports — pricing, acceptance, handmade variation, warranty and liability.',
    updated: 'These terms were last updated when the site was published.',
    body: [
      ['Who you are dealing with', `
        <p>Toss Sports, a handcrafted cricket bat maker operating from Chennai, Tamil Nadu.
        Our workshop address and phone numbers are on every page of this site.</p>`],
      ['Orders', `
        <p>Placing an order is an offer to buy. The order is accepted when we confirm it
        with you — normally on WhatsApp. Until then we may decline it, for example if the
        bat is no longer available or the price on the page was wrong.</p>`],
      ['Prices', `
        <p>All prices are in Indian Rupees and include applicable taxes. We may change
        prices at any time, but never on an order we have already accepted.</p>`],
      ['Every bat is made by hand', `
        <p>This matters more here than it would elsewhere. Wood is a natural material and
        each bat is shaped individually, so grain, colour, exact weight and finish vary
        between bats — including between two of the same model. Photographs show a
        representative bat, not the specific one you will receive, unless we have sent
        you a photo of yours.</p>
        <p>Weight is quoted as a range for this reason. Variation within the stated range
        is the bat working as intended, not a fault.</p>`],
      ['Made-to-order and personalised items', `
        <p>Custom bats, engraved bats and printed jerseys are made for you specifically
        and cannot be resold. See the Refund &amp; Return Policy for what that means.</p>`],
      ['Warranty', `
        <p>Where a bat is sold with a stated warranty, that warranty covers manufacturing
        defects for the stated period from delivery.</p>
        <p>It does not cover normal wear, damage from use with a ball the bat was not made
        for, water damage, damage from misuse or accident, or a bat that has been repaired
        or altered by someone else. Tennis ball bats are built for tennis balls; using one
        against a leather season ball will damage it and is not a defect.</p>`],
      ['Care', `
        <p>Bats sold raw or unfurnished need knocking in and oiling before use. Damage
        caused by skipping that is not a manufacturing defect.</p>`],
      ['Our responsibility', `
        <p>If we get something wrong, we will repair it, replace it, or refund it. Beyond
        that, our responsibility for any order is limited to what you paid for it. Nothing
        in these terms removes rights you have under Indian consumer law.</p>`],
      ['Using this site', `
        <p>The photographs, text and designs on this site belong to Toss Sports. The game,
        discount codes and rewards are offered in good fun — we may change or withdraw
        them, and codes obtained by manipulating the game will not be honoured.</p>`],
      ['Governing law', `
        <p>These terms are governed by the laws of India, and the courts at Chennai, Tamil
        Nadu have jurisdiction.</p>`]
    ]
  },

  'refund-policy': {
    h1: 'Refund & Return Policy',
    title: 'Refund & Return Policy',
    desc: `What to do if a Toss bat arrives damaged or faulty, what can be returned, and how long a refund takes.`,
    updated: 'This policy was last updated when the site was published.',
    body: [
      ['If something is wrong, tell us quickly', `
        <p>Message us on WhatsApp within <b>${RETURN_DAYS} days</b> of delivery with your
        order number and photographs of the problem. Photographs are not a formality —
        they are usually enough for us to tell what happened and sort it out without the
        bat travelling anywhere.</p>`],
      ['What we will do', `
        <p>If the bat arrived damaged, or has a manufacturing defect, or is not what you
        ordered, we will repair it, replace it, or refund it. Which of those depends on
        the bat and on what you would prefer — we will discuss it with you rather than
        decide for you.</p>
        <p>Where a bat has to come back to us, we pay the return shipping.</p>`],
      ['What cannot be returned', `
        <p>Some things genuinely cannot be taken back, because nobody else can use them:</p>
        <ul>
          <li>bats made to your own specification</li>
          <li>anything engraved with a name, number or team</li>
          <li>printed jerseys and team kit</li>
          <li>a bat that has been used, knocked in or oiled — unless the fault is a
              manufacturing defect, which is covered regardless</li>
        </ul>
        <p>This does not affect a manufacturing defect. A custom bat with a genuine fault
        is still our problem to fix.</p>`],
      ['Changed your mind', `
        <p>If a stock bat is unused, unmarked and still in its wrapping, tell us within
        <b>${RETURN_DAYS} days</b> of delivery and we will take it back. Return shipping
        in that case is yours to cover, since nothing was wrong with the bat.</p>`],
      ['Refunds', `
        <p>Once we have the bat back, or once photographs settle it, refunds are issued to
        the original payment method within <b>${REFUND_DAYS} working days</b>. How long it
        then takes to appear is up to your bank.</p>
        <p>Cash on delivery orders are refunded by bank transfer or UPI to an account in
        the name of the person who placed the order.</p>`],
      ['Cancelling', `
        <p>An order can be cancelled any time before it ships, and we will refund it in
        full. A made-to-order or engraved bat can be cancelled until work starts on it —
        after that it exists and cannot be unmade.</p>`],
      ['How to reach us', `
        <p>WhatsApp <a href="https://wa.me/919176995707" rel="noopener" target="_blank">+91
        91769 95707</a>, or email
        <a href="mailto:contact@tossports.in">contact@tossports.in</a> with your order
        number.</p>`]
    ]
  },

  'shipping-policy': {
    h1: 'Shipping Policy',
    title: 'Shipping Policy',
    desc: 'How long a handmade Toss bat takes to make and ship, what delivery costs, and where we deliver.',
    updated: 'This policy was last updated when the site was published.',
    body: [
      ['How long it takes', `
        <p>Bats are made by hand, so nothing ships from a warehouse the same hour you
        order. A bat we have on the shelf leaves us in <b>${DISPATCH_DAYS} working
        days</b>. A made-to-order or custom bat takes longer, and we will tell you how
        long when we confirm the order rather than guess here.</p>
        <p>After dispatch, delivery is usually <b>${DELIVERY_DAYS} working days</b>
        depending on where you are. Chennai is quicker.</p>`],
      ['What it costs', `
        <p>Shipping is free on orders over <b>₹1,500</b>. Below that, the fee is shown at
        checkout before you pay.</p>`],
      ['Where we deliver', `
        <p>We deliver across India. Some pin codes are not served by our couriers, and
        checkout will tell you if yours is one of them before you place the order.</p>
        <p>We do not currently ship outside India. If you want a Toss bat abroad, message
        us — we will tell you honestly what it would cost rather than surprise you with
        it.</p>`],
      ['Tracking', `
        <p>Once your order ships you can follow it from the
        <a href="../#/track">track order</a> page using your order number and the phone
        number you ordered with. No account needed.</p>`],
      ['If it arrives damaged', `
        <p>Photograph the parcel before you open it fully and message us the same day.
        Courier damage is easiest to resolve while the packaging still tells the story.
        See the <a href="../refund-policy/">Refund &amp; Return Policy</a>.</p>`],
      ['Wrong address', `
        <p>Check your address and pin code at checkout. If a parcel comes back to us
        because the address was wrong or nobody could take delivery, we will resend it,
        but the second delivery charge is yours.</p>`]
    ]
  }
};

module.exports = { LEGAL, RETURN_DAYS, REFUND_DAYS, DISPATCH_DAYS, DELIVERY_DAYS };
