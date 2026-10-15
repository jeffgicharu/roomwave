<script lang="ts">
  import Icon from "./Icon.svelte";

  interface Props {
    id: string;
    label: string;
    value: string;
    error?: string;
    hint?: string;
    autocomplete: "current-password" | "new-password";
  }

  let { id, label, value = $bindable(), error, hint, autocomplete }: Props = $props();
  let visible = $state(false);
</script>

<div class="field">
  <label class="label" for={id}>{label}</label>
  <div class="wrap">
    <input
      {id}
      class="input"
      type={visible ? "text" : "password"}
      bind:value
      {autocomplete}
      aria-invalid={error ? "true" : undefined}
      aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
      required
    />
    <button type="button" class="toggle" aria-label={visible ? "Hide password" : "Show password"} onclick={() => (visible = !visible)}>
      <Icon name={visible ? "eye-off" : "eye"} size={19} />
    </button>
  </div>
  {#if error}
    <p class="field-error" id={`${id}-error`}>{error}</p>
  {:else if hint}
    <p class="hint" id={`${id}-hint`}>{hint}</p>
  {/if}
</div>

<style>
  .wrap {
    position: relative;
  }

  .wrap .input {
    padding-right: 52px;
  }

  .toggle {
    position: absolute;
    top: 50%;
    right: 6px;
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border: 0;
    border-radius: var(--radius-s);
    background: transparent;
    color: var(--ink-3);
    transform: translateY(-50%);
    cursor: pointer;
  }

  .toggle:hover {
    background: var(--paper-2);
    color: var(--ink);
  }
</style>
