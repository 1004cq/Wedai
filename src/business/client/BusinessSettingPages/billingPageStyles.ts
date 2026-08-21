import { createStaticStyles } from 'antd-style';

/** Shared layout styles for personal billing settings pages. */
export const billingPageStyles = createStaticStyles(({ css, cssVar }) => ({
  badge: css`
    padding-block: 2px;
    padding-inline: 8px;
    border-radius: 4px;

    font-size: 11px;
    font-weight: 600;
    color: ${cssVar.colorPrimary};

    background: ${cssVar.colorPrimaryBg};
  `,
  card: css`
    display: flex;
    flex-direction: column;
    gap: 12px;

    min-width: 0;
    padding: 20px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};

    background: ${cssVar.colorBgContainer};
  `,
  currentBadge: css`
    padding-block: 2px;
    padding-inline: 8px;
    border-radius: 4px;

    font-size: 11px;
    font-weight: 600;
    color: ${cssVar.colorSuccess};

    background: ${cssVar.colorSuccessBg};
  `,
  grid: css`
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    margin-block-start: 16px;
  `,
  label: css`
    margin-block-end: 4px;
    font-size: 13px;
    color: ${cssVar.colorTextSecondary};
  `,
  price: css`
    font-size: 26px;
    font-weight: 700;
  `,
  row: css`
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    margin-block-end: 24px;
  `,
  statusBadge: css`
    display: inline-block;

    padding-block: 2px;
    padding-inline: 8px;
    border-radius: 4px;

    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
  `,
  table: css`
    border-collapse: collapse;
    width: 100%;
    font-size: 13px;

    th {
      padding-block-end: 8px;
      text-align: start;
      opacity: 0.6;
    }

    td {
      padding-block: 8px;
      border-block-start: 1px solid ${cssVar.colorBorderSecondary};
    }
  `,
  title: css`
    margin-block-end: 16px;
    font-size: 22px;
    font-weight: 600;
  `,
  value: css`
    font-size: 28px;
    font-weight: 700;
    color: ${cssVar.colorText};
  `,
  wrapper: css`
    max-width: 880px;
    padding-block: 16px 48px;
    padding-inline: 16px;

    @media (width >= 768px) {
      padding-block: 24px;
      padding-inline: 0;
    }
  `,
}));
