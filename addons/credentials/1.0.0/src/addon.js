import Index from './pages/index.vue'
const HelpXero = () => import('./pages/help-xero.vue')
const AuditLogs = () => import('./pages/audit-logs.vue')

const routes = [
  {
    path: '/credentials/',
    name: 'credentials__index',
    component: Index,
  },
  {
    path: '/credentials/help/xero',
    component: HelpXero,
  },
  {
    path: '/credentials/audit-logs/:realm',
    component: AuditLogs,
  },
];
export default routes;
