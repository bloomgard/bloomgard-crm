/**
 * Bloomgard wordmark, a hairline divider and the product name in the display face:
 * the same lockup docs.bloomgard.co uses ("Bloomgard | Docs"), here "Bloomgard | CMA".
 *
 * tone="auto"   follows the workspace theme (the `dark` class on an ancestor)
 * tone="onLight" / "onDark"   force the ink or the paper wordmark
 */
export default function BrandLockup({
  height = 28, tone = 'auto', className = '', style,
}: { height?: number; tone?: 'auto' | 'onLight' | 'onDark'; className?: string; style?: React.CSSProperties }) {
  const word = { height, width: 'auto' } as const;
  return (
    <span className={`inline-flex items-center ${className}`} style={{ gap: Math.round(height * 0.42), ...style }}>
      {tone !== 'onDark' && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/brand/wordmark-kajal.png" alt="Bloomgard" width={896} height={171} style={word} className={tone === 'auto' ? 'dark:hidden' : ''} />
      )}
      {tone !== 'onLight' && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/brand/wordmark-kora.png" alt="Bloomgard" width={896} height={171} style={word} className={tone === 'auto' ? 'hidden dark:block' : ''} />
      )}
      <span aria-hidden="true" style={{ width: 1, height: Math.round(height * 0.9), background: 'currentColor', opacity: 0.28 }} />
      <span
        style={{ fontFamily: 'var(--font-display), Georgia, "Times New Roman", serif', fontSize: Math.round(height * 0.95), lineHeight: 1, letterSpacing: '-0.01em' }}
      >CMA</span>
    </span>
  );
}
