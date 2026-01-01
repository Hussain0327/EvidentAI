export function PassFailBadge({ passed }: { passed: boolean }) {
  return <span>{passed ? 'Pass' : 'Fail'}</span>
}
