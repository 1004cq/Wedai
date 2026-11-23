'use client';

import { Navigate, Outlet, useParams } from 'react-router';

import ProviderMenu from '@/features/Settings/provider/ProviderMenu';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { usePlatformAiSettingsAccess } from '@/hooks/usePlatformAiSettingsAccess';

const Layout = () => {
  const params = useParams<{ providerId: string }>();
  const navigate = useWorkspaceAwareNavigate();
  const { showProvider } = usePlatformAiSettingsAccess();

  if (!showProvider) {
    return <Navigate replace to={'/settings'} />;
  }

  const handleProviderSelect = (providerKey: string) => {
    navigate(`/settings/provider/${providerKey}`);
  };

  return params.providerId === 'all' ? (
    <ProviderMenu mobile={true} onProviderSelect={handleProviderSelect} />
  ) : (
    <Outlet />
  );
};

export default Layout;
