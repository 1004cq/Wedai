'use client';

import { Alert } from '@lobehub/ui/base-ui';
import { useTranslation } from 'react-i18next';

import { ModelAssignmentsForm } from '@/features/ServiceModel';
import { usePlatformAiSettingsAccess } from '@/hooks/usePlatformAiSettingsAccess';
import SettingHeader from '@/routes/(main)/settings/features/SettingHeader';
import { featureFlagsSelectors, useServerConfigStore } from '@/store/serverConfig';

import Image from '../image/features/Image';
import OpenAI from '../tts/features/OpenAI';

interface PageProps {
  showSettingHeader?: boolean;
}

const Page = ({ showSettingHeader = true }: PageProps) => {
  const { t } = useTranslation('setting');
  const { enableSTT, showAiImage } = useServerConfigStore(featureFlagsSelectors);
  const { showServiceModel, platformAiLocked } = usePlatformAiSettingsAccess();

  if (!showServiceModel) {
    return (
      <>
        {showSettingHeader && <SettingHeader title={t('tab.serviceModel')} />}
        <Alert
          showIcon
          description={t('platformAi.adminOnly.desc')}
          message={t('platformAi.adminOnly.title')}
          type={'info'}
        />
      </>
    );
  }

  return (
    <>
      {showSettingHeader && <SettingHeader title={t('tab.serviceModel')} />}
      {platformAiLocked ? (
        <Alert
          showIcon
          description={t('platformAi.adminManaged.desc')}
          message={t('platformAi.adminOnly.title')}
          style={{ marginBottom: 16 }}
          type={'info'}
        />
      ) : null}
      <ModelAssignmentsForm />
      {enableSTT && <OpenAI />}
      {showAiImage && <Image />}
    </>
  );
};

export default Page;
