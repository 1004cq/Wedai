'use client';

import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { billingPageStyles as styles } from './billingPageStyles';

/**
 * Referral rewards are not fully productized yet.
 * Keep a non-null placeholder so deep links / desktop tabs never white-screen.
 * The Me / settings menu hides this entry until the feature ships.
 */
const Referral: FC = () => {
  const { t } = useTranslation('billing');

  return (
    <div className={styles.wrapper}>
      <h2 className={styles.title}>{t('referral.title')}</h2>
      <div className={styles.card}>
        <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>{t('referral.comingSoon')}</p>
        <p style={{ opacity: 0.7 }}>{t('referral.desc')}</p>
      </div>
    </div>
  );
};

export default Referral;
