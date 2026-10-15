<script lang="ts">
  import { onMount } from "svelte";

  // The audience's view of a poll, as drawn on the phone in the photograph.
  const options = [
    { label: "Start on time", colour: "#f25c1f" },
    { label: "Fewer slides", colour: "#0f9890" },
    { label: "More questions", colour: "#6b5cff" },
    { label: "Better coffee", colour: "#c27f00" },
  ];
  let shares = $state([31, 18, 38, 13]);

  onMount(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => {
      const next = shares.map((s) => Math.max(4, s + Math.round((Math.random() - 0.5) * 6)));
      const total = next.reduce((a, b) => a + b, 0);
      shares = next.map((s) => Math.round((s / total) * 100));
    }, 1600);
    return () => clearInterval(timer);
  });
</script>

<div class="phone">
  <div class="bar">
    <svg viewBox="0 0 33 24" width="22" height="16" aria-hidden="true">
      {#each [[0, 9], [7, 15], [14, 22], [21, 15], [28, 24]] as [x, h] (x)}<rect x={x} y={24 - h!} width="5" height={h} rx="2.5" fill="#ff6a2b" />{/each}
    </svg>
    <span>Team offsite</span>
    <i></i>
  </div>
  <p class="kind">Pick one</p>
  <p class="q">What should we fix first?</p>
  <div class="options">
    {#each options as option, i (option.label)}
      <div class="option" class:on={i === 2} style={`--c:${option.colour}`}>
        <b>{String.fromCharCode(65 + i)}</b><span>{option.label}</span>{#if i === 2}<em>✓</em>{/if}
      </div>
    {/each}
  </div>
  <p class="sent">✓ Answer sent</p>
  <div class="mini">
    <p>The room so far</p>
    {#each options as option, i (option.label)}
      <div class="row"><span>{option.label}</span><span class="track"><span style={`width:${shares[i]}%`}></span></span><span class="pct">{shares[i]}%</span></div>
    {/each}
  </div>
</div>

<style>
  .phone {
    width: 100%;
    height: 100%;
    padding: 38px 20px 20px;
    background: #fbf7f0;
    color: #1d1430;
    font-family: var(--font-text);
  }

  .bar {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 15px;
    font-weight: 600;
    color: #6b6079;
  }

  .bar span {
    flex: 1;
  }

  .bar i {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: #14a098;
  }

  .kind {
    margin-top: 26px;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #c4410c;
  }

  .q {
    margin: 6px 0 18px;
    font-family: var(--font-display);
    font-size: 30px;
    font-weight: 700;
    line-height: 1.05;
    letter-spacing: -0.02em;
  }

  .options {
    display: grid;
    gap: 9px;
  }

  .option {
    display: flex;
    align-items: center;
    gap: 12px;
    height: 54px;
    padding: 0 12px;
    border: 2px solid #e6dccd;
    border-radius: 14px;
    background: #fff;
    font-size: 17px;
    font-weight: 600;
  }

  .option.on {
    border-color: var(--c);
  }

  .option b {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: 9px;
    background: var(--c);
    color: #fff;
  }

  .option span {
    flex: 1;
  }

  .option em {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: var(--c);
    color: #fff;
    font-style: normal;
    font-weight: 800;
  }

  .sent {
    margin: 14px 0;
    font-size: 15px;
    font-weight: 700;
    color: #0b6f69;
  }

  .mini {
    display: grid;
    gap: 9px;
    padding: 14px;
    border: 1px solid #e6dccd;
    border-radius: 14px;
    background: #fff;
    font-size: 13px;
  }

  .mini p {
    font-weight: 700;
    font-size: 14px;
  }

  .row {
    display: grid;
    grid-template-columns: 1fr 1fr 38px;
    align-items: center;
    gap: 8px;
  }

  .track {
    height: 8px;
    border-radius: 99px;
    background: #f1e9dc;
    overflow: hidden;
  }

  .track span {
    display: block;
    height: 100%;
    background: #ff6a2b;
    transition: width 700ms cubic-bezier(0.34, 1.42, 0.64, 1);
  }

  .pct {
    text-align: right;
    font-weight: 700;
  }
</style>
