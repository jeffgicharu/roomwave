<script lang="ts" generics="T extends string | number">
  interface Props {
    label: string;
    name: string;
    value: T;
    options: { value: T; label: string }[];
  }

  let { label, name, value = $bindable(), options }: Props = $props();
</script>

<fieldset class="segmented">
  <legend class="label">{label}</legend>
  <div class="choices">
    {#each options as option (option.value)}
      <label class:on={value === option.value}>
        <input type="radio" {name} value={option.value} checked={value === option.value} onchange={() => (value = option.value)} />
        <span>{option.label}</span>
      </label>
    {/each}
  </div>
</fieldset>

<style>
  .segmented {
    margin: 0;
    padding: 0;
    border: 0;
    min-width: 0;
  }

  legend {
    margin-bottom: 0.4rem;
    padding: 0;
  }

  .choices {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 4px;
    border-radius: var(--radius-s);
    background: var(--paper-2);
  }

  label {
    position: relative;
    flex: 1 1 auto;
    display: grid;
    place-items: center;
    min-width: 44px;
    min-height: 38px;
    padding: 0 10px;
    border-radius: 6px;
    font-size: 0.92rem;
    font-weight: 600;
    color: var(--ink-2);
    cursor: pointer;
  }

  label:hover {
    color: var(--ink);
  }

  label.on {
    background: var(--card);
    color: var(--ink);
    box-shadow: var(--shadow-1);
  }

  input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  label:has(input:focus-visible) {
    outline: 3px solid var(--signal);
    outline-offset: 1px;
  }
</style>
