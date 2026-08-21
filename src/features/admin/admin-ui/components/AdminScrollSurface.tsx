'use client';

import { createStaticStyles, cssVar } from 'antd-style';
import type { PropsWithChildren } from 'react';

const styles = createStaticStyles(({ css }) => ({
  /**
   * Keeps wide antd Tables from expanding the document width on phones.
   * Horizontal scroll stays inside this shell; the Admin chrome stays viewport-sized.
   */
  shell: css`
    overflow-x: auto;

    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    max-width: 100%;

    -webkit-overflow-scrolling: touch;

    /* antd table wrapper can otherwise grow the page past 100vw */
    .ant-table-wrapper,
    .ant-spin-nested-loading,
    .ant-spin-container,
    .ant-table,
    .ant-table-container {
      max-width: 100%;
    }
  `,
  cardList: css`
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 100%;
  `,
  card: css`
    box-sizing: border-box;
    width: 100%;
    padding-block: 14px;
    padding-inline: 16px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};

    background: ${cssVar.colorBgContainer};
  `,
  cardMeta: css`
    display: flex;
    flex-wrap: wrap;
    gap: 8px 12px;

    margin-block-start: 8px;

    font-size: ${cssVar.fontSizeSM};
    color: ${cssVar.colorTextSecondary};
  `,
  cardActions: css`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-block-start: 12px;
  `,
}));

export const AdminScrollSurface = ({ children }: PropsWithChildren) => (
  <div className={styles.shell}>{children}</div>
);

export const adminMobileListStyles = styles;
