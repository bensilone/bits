export function Fairness() {
  return (
    <div className="container page prose">
      <h1>Fairness</h1>
      <p>
        Sparks is a prize game funded by verified compute. You earn <strong>entries</strong>.
        Winners are drawn by weight — more entries, better odds — then everyone starts over.
      </p>

      <div className="callout">
        <strong>Period wipe (required)</strong>
        Entries are for <em>this</em> award event only. After winners are published,{" "}
        <strong>everyone’s entries reset to zero</strong>. Daily and weekly drops are{" "}
        <strong>separate races</strong>, not one pile that lasts all week.
      </div>

      <h2>How entries work</h2>
      <p>
        Your computer does verified work (v1 example: Monero mining to a public pool under a
        Sparks treasury wallet). The backend turns attested work into spark credits, then into
        entries: <code>entries = floor(credits / CREDITS_PER_ENTRY)</code>. The client never
        self-reports entries.
      </p>
      <p>
        1 entry ≈ a fixed amount of verified Spark credits. What your computer does may change;
        the credit target for a normal machine stays steady via operator-tuned multipliers.
      </p>

      <h2>How winners are chosen</h2>
      <ul>
        <li>Snapshot all period banks at award time.</li>
        <li>Publish a ticket commitment and a public entropy seed.</li>
        <li>Weighted draw without replacement on device (one prize per device per event).</li>
        <li>Multiple prize lines (amount × quantity) drawn from the same pool.</li>
        <li>Same algorithm ships in this repo — anyone can recompute.</li>
      </ul>

      <h2>Veto / re-roll</h2>
      <p>
        Rare abuse cases can be vetoed by the operator with a logged reason. That seat is
        re-rolled excluding the vetoed device. We don’t doxx people.
      </p>

      <h2>What this is not</h2>
      <p>
        Not a job. Not guaranteed income. Electricity is your cost of playing. Most people won’t
        win — that’s an honest lottery.
      </p>
    </div>
  );
}
