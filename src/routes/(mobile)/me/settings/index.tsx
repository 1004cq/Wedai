'use client';

import { memo } from 'react';
import { Navigate } from 'react-router';

/** Intermediate settings shell removed — entries live on `/me`. */
const MeSettingsRedirect = memo(() => <Navigate replace to="/me" />);

MeSettingsRedirect.displayName = 'MeSettingsRedirect';

export default MeSettingsRedirect;
