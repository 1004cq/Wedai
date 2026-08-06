export const formatCredits = (credits: number): string => credits.toLocaleString('zh-CN');

export const formatMinorCurrency = (amountMinor: number): string => {
  const sign = amountMinor < 0 ? '-' : '';
  const absolute = Math.abs(amountMinor);
  const major = Math.floor(absolute / 100).toLocaleString('zh-CN');
  const minor = String(absolute % 100).padStart(2, '0');
  return `${sign}¥${major}.${minor}`;
};

export const formatDateTime = (value: string): string =>
  new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
