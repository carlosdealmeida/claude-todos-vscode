<script lang="ts">
  // Conjunto de ícones SVG inline (mesmo padrão do StatusIcon): herdam a cor via
  // currentColor, então combinam com o tema do VSCode. Substituem os emoji.
  type IconName = 'clock' | 'hourglass' | 'chevron' | 'refresh' | 'pin' | 'dot';
  let { name, size = 14 }: { name: IconName; size?: number } = $props();
</script>

<svg
  class="ico"
  width={size}
  height={size}
  viewBox="0 0 16 16"
  fill="none"
  stroke="currentColor"
  stroke-width="1.4"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  {#if name === 'clock'}
    <circle cx="8" cy="8" r="5.75" />
    <path d="M8 4.75V8l2.25 1.5" />
  {:else if name === 'hourglass'}
    <path d="M4.5 2.5h7M4.5 13.5h7M5.25 2.5l2.75 5 2.75-5M5.25 13.5l2.75-5 2.75 5" />
  {:else if name === 'chevron'}
    <path d="M6 4l4 4-4 4" />
  {:else if name === 'refresh'}
    <path d="M12.5 8a4.5 4.5 0 1 1-1.3-3.18M12.5 2.5V5H10" />
  {:else if name === 'pin'}
    <path d="M8 9.5V14" />
    <path d="M5.5 2.5h5l-1 4 1.5 1.5h-6l1.5-1.5-1-4Z" fill="currentColor" stroke="none" />
  {:else if name === 'dot'}
    <circle cx="8" cy="8" r="3.25" fill="currentColor" stroke="none" />
  {/if}
</svg>

<style>
  .ico {
    display: inline-block;
    vertical-align: -0.15em;
    flex: none;
  }
</style>
