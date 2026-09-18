import { Link } from "react-router-dom";

export function About() {
  return (
    <div className="container page prose">
      <h1>About / FAQ</h1>
      <p>
        <strong>Sparks</strong> (public lean: winbitcoin.app) is a voluntary idle-compute prize
        game. Your machine helps do useful work when you’re away; you get lottery entries; prizes
        are paid in USDT or Bitcoin (XMR optional).
      </p>

      <h2>How does my computer help?</h2>
      <p>
        Today, a common example is <strong>Monero (RandomX) mining</strong> to a public pool that
        pays a Sparks treasury wallet. That’s plumbing — the product is entries and prizes. Work
        types can change later without changing the home-screen story.
      </p>

      <h2>Is this income?</h2>
      <p>No. It’s a prize game. Most people won’t win. Electricity is your cost of playing.</p>

      <h2>Do I need an account?</h2>
      <p>No email, no seed phrases. The app generates a local device id.</p>

      <h2>Where do winnings go?</h2>
      <p>
        You set USDT (TRC20 default), BTC, and/or XMR addresses in the app. Preferred payout is
        your choice. v1 payouts are manual.
      </p>

      <h2>Why do entries reset?</h2>
      <p>
        After each award event, everyone’s period bank clears so the next countdown is a fresh
        race. See <Link to="/fairness">Fairness</Link>.
      </p>

      <h2>Referrals</h2>
      <p>
        Share your link. If a friend wins, you get +10% of that prize as an extra payout from the
        treasury (winner still gets 100%).
      </p>
    </div>
  );
}
