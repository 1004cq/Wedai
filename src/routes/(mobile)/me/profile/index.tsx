'use client';

import { memo } from 'react';
import { Navigate } from 'react-router';

/** Intermediate account shell removed — entries live on `/me`. */
const MeProfileRedirect = memo(() => <Navigate replace to="/me" />);

MeProfileRedirect.displayName = 'MeProfileRedirect';

export default MeProfileRedirect;
