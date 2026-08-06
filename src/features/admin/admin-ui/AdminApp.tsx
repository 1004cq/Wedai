'use client';

import { Navigate, Route, Routes } from 'react-router';

import { AdminGuard } from './components/AdminGuard';
import { AdminLayout } from './components/AdminLayout';
import { AuditPage } from './pages/AuditPage';
import { DashboardPage } from './pages/DashboardPage';
import { EmailConfigPage } from './pages/EmailConfigPage';
import { OrdersPage } from './pages/OrdersPage';
import { PaymentConfigPage } from './pages/PaymentConfigPage';
import { PricesPage } from './pages/PricesPage';
import { SmsConfigPage } from './pages/SmsConfigPage';
import { UsersPage } from './pages/UsersPage';

export const AdminApp = () => (
  <AdminLayout>
    <Routes>
      <Route
        index
        element={
          <AdminGuard permission={'admin:dashboard:read'}>
            <DashboardPage />
          </AdminGuard>
        }
      />
      <Route
        path={'users'}
        element={
          <AdminGuard permission={'user:read'}>
            <UsersPage />
          </AdminGuard>
        }
      />
      <Route
        path={'orders'}
        element={
          <AdminGuard permission={'billing:order:read'}>
            <OrdersPage />
          </AdminGuard>
        }
      />
      <Route
        path={'prices'}
        element={
          <AdminGuard permission={'billing:price:read'}>
            <PricesPage />
          </AdminGuard>
        }
      />
      <Route
        path={'payment'}
        element={
          <AdminGuard permission={'billing:payment:config'}>
            <PaymentConfigPage />
          </AdminGuard>
        }
      />
      <Route
        path={'email'}
        element={
          <AdminGuard permission={'system:email:config'}>
            <EmailConfigPage />
          </AdminGuard>
        }
      />
      <Route
        path={'sms'}
        element={
          <AdminGuard permission={'system:sms:config'}>
            <SmsConfigPage />
          </AdminGuard>
        }
      />
      <Route
        path={'audit'}
        element={
          <AdminGuard permission={'admin:audit:read'}>
            <AuditPage />
          </AdminGuard>
        }
      />
      <Route element={<Navigate replace to={'/admin'} />} path={'*'} />
    </Routes>
  </AdminLayout>
);
