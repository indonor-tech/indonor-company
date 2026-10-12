import React, { useEffect, useState } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AppBar, Avatar, Badge, Box, Collapse, Divider, Drawer, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Toolbar, Tooltip, Typography, useMediaQuery, useTheme } from '@mui/material';
import { AccountTreeOutlined, ArticleOutlined, AssessmentOutlined, AssignmentOutlined, BadgeOutlined, BusinessOutlined, CalendarMonthOutlined, ChecklistOutlined, DashboardOutlined, DescriptionOutlined, EditCalendarOutlined, EmailOutlined, EventNoteOutlined, ExpandLess, ExpandMore, FactCheckOutlined, FolderOutlined, GroupOutlined, HistoryOutlined, HowToRegOutlined, LanguageOutlined, ListAltOutlined, ManageAccountsOutlined, MenuOutlined, NotificationsNoneOutlined, PaymentsOutlined, PersonOutlined, RateReviewOutlined, SettingsOutlined, TaskAltOutlined, TrendingUpOutlined, ViewKanbanOutlined, WorkOutlineOutlined } from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';

const navButtonSx = {
  borderRadius: 1.5,
  minHeight: 44,
  mb: .4,
  '&.active': { bgcolor: 'primary.light', color: 'primary.dark', '& .MuiListItemIcon-root': { color: 'primary.main' } }
};

const navigation = [
  { label: 'Dashboard', path: '/', icon: <DashboardOutlined />, section: 'Overview', pageKey: 'dashboard' },
  { label: 'My profile', path: '/me', icon: <PersonOutlined />, section: 'Overview', pageKey: 'profile' },
  {
    label: 'Leads & Clients',
    icon: <BusinessOutlined />,
    section: 'CRM',
    children: [
      { label: 'Leads', path: '/crm/leads', icon: <TrendingUpOutlined />, permission: 'crm:leads:read', pageKey: 'leads' },
      { label: 'Sales pipeline', path: '/crm/pipeline', icon: <ViewKanbanOutlined />, permission: 'crm:leads:read', pageKey: 'sales_pipeline' },
      { label: 'Clients', path: '/crm/clients', icon: <BusinessOutlined />, permission: 'crm:clients:read', pageKey: 'clients' }
    ]
  },
  // {
  //   label: 'Projects',
  //   icon: <FolderOutlined />,
  //   section: 'Projects',
  //   children: [
  //     { label: 'Client projects', path: '/crm/projects', icon: <FolderOutlined />, permission: 'crm:projects:read', pageKey: 'projects' },
  //     { label: 'Task projects', path: '/tasks/projects', icon: <FolderOutlined />, permission: 'task:read', pageKey: 'tasks' }
  //   ]
  // },
  {
    label: 'Tasks & Follow-ups',
    icon: <TaskAltOutlined />,
    section: 'Tasks',
    children: [
      { label: 'Dashboard', path: '/tasks', exact: true, icon: <DashboardOutlined />, permission: 'task:read', pageKey: 'tasks' },
      { label: 'My Tasks', path: '/tasks/my', icon: <ChecklistOutlined />, permission: 'task:read', pageKey: 'tasks' },
      { label: 'All Tasks', path: '/tasks/all', icon: <ListAltOutlined />, permissionAny: ['task:read:all', 'task:read:team'], pageKey: 'tasks' },
      { label: 'Daily Work Logs', path: '/tasks/work-logs', icon: <EventNoteOutlined />, permission: 'task:read', pageKey: 'tasks' },
      { label: 'Calendar', path: '/tasks/calendar', icon: <CalendarMonthOutlined />, permission: 'task:read', pageKey: 'tasks' },
      { label: 'Corrections', path: '/tasks/corrections', icon: <RateReviewOutlined />, permission: 'task:read', pageKey: 'tasks' },
      { label: 'Reports', path: '/tasks/reports', icon: <FactCheckOutlined />, permission: 'task:reports:read', pageKey: 'tasks' },
      { label: 'Audit History', path: '/tasks/audit', icon: <HistoryOutlined />, permission: 'task:audit:read', pageKey: 'tasks' },
      { label: 'Calendar setup', path: '/tasks/setup', icon: <EditCalendarOutlined />, permission: 'task:calendar:manage', pageKey: 'tasks' }
    ]
  },
  { label: 'Invoices & Payments', path: '/crm/finance', icon: <PaymentsOutlined />, section: 'Finance', permission: 'crm:finance:read', roles: ['SUPER_ADMIN'], pageKey: 'invoices' },
  {
    label: 'Recruitment & HR',
    icon: <HowToRegOutlined />,
    section: 'Recruitment',
    children: [
      { label: 'Employees', path: '/employees', icon: <GroupOutlined />, permission: 'employee:read', pageKey: 'employees' },
      { label: 'Candidates', path: '/candidates', icon: <HowToRegOutlined />, permission: 'candidate:read', pageKey: 'candidates' },
      { label: 'Hiring pipeline', path: '/pipeline', icon: <AccountTreeOutlined />, permission: 'candidate:read', pageKey: 'hiring_pipeline' },
      { label: 'Interviews', path: '/interviews', icon: <CalendarMonthOutlined />, permission: 'interview:read', pageKey: 'interviews' }
    ]
  },
  { label: 'Notifications', path: '/notifications', icon: <NotificationsNoneOutlined />, section: 'Communications', pageKey: 'notifications' },
  { label: 'Email', path: '/email', icon: <EmailOutlined />, section: 'Communications', permission: 'email:send', pageKey: 'email' },
  {
    label: 'Workspace & Teams',
    icon: <LanguageOutlined />,
    section: 'Workspace',
    children: [
      { label: 'Enquiries', path: '/contact-submissions', icon: <EmailOutlined />, permission: 'contact:read', pageKey: 'contact_submissions' },
      { label: 'Traffic', path: '/website-analytics', icon: <LanguageOutlined />, permission: 'analytics:read', pageKey: 'website_analytics' },
      { label: 'Team', path: '/website-team', icon: <GroupOutlined />, permission: 'website:read', pageKey: 'website_team' },
      { label: 'Website projects', path: '/website-projects', icon: <WorkOutlineOutlined />, permission: 'website:read', pageKey: 'website_projects' },
      { label: 'Departments & skills', path: '/catalogs', icon: <AccountTreeOutlined />, permission: 'catalog:read', pageKey: 'catalogs' }
    ]
  },
  { label: 'Offer letter', path: '/letters/offer', icon: <DescriptionOutlined />, section: 'Letters', permissionAny: ['employee:update', 'candidate:update'], pageKey: 'letters_offer' },
  { label: 'Agreement letter', path: '/letters/agreement', icon: <AssignmentOutlined />, section: 'Letters', permission: 'employee:update', pageKey: 'letters_agreement' },
  { label: 'Relieving letter', path: '/letters/relieving', icon: <ArticleOutlined />, section: 'Letters', permission: 'employee:update', pageKey: 'letters_relieving' },
  { label: 'Company card', path: '/letters/company-card', icon: <BadgeOutlined />, section: 'Letters', permission: 'employee:update', pageKey: 'letters_company_card' },
  { label: 'Reports & Analytics', path: '/reports', icon: <AssessmentOutlined />, section: 'Reports', permission: 'reports:read', pageKey: 'reports' },
  { label: 'CRM users', path: '/users', icon: <ManageAccountsOutlined />, section: 'Settings', permission: 'users:read', pageKey: 'users' },
  { label: 'Settings', path: '/settings', icon: <SettingsOutlined />, section: 'Settings', roles: ['SUPER_ADMIN', 'ADMIN'], pageKey: 'settings' }
];

function viewAdminCanPage(user, pageKey) {
  if (!pageKey || !user) return false;
  const access = user.pageAccess || {};
  if (pageKey === 'profile' || pageKey === 'notifications') return true;
  if (access[pageKey]) return true;
  if (pageKey === 'sales_pipeline' && access.leads) return true;
  if (pageKey === 'hiring_pipeline' && access.candidates) return true;
  return false;
}

function itemAllowed(item, can, is, user) {
  if (user?.role === 'VIEW_ADMIN') {
    if (item.pageKey === 'invoices') return false;
    if (!item.pageKey) return true;
    return viewAdminCanPage(user, item.pageKey);
  }
  if (item.roles?.length && !is(...item.roles)) return false;
  if (item.permission && !can(item.permission)) return false;
  if (item.permissionAny?.length && !item.permissionAny.some((permission) => can(permission))) return false;
  return true;
}

function pathActive(pathname, path, exact = false) {
  if (path === '/' || exact) return pathname === path;
  return pathname === path || pathname.startsWith(`${path}/`);
}

export default function AppLayout() {
  const [open, setOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState({});
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down('md'));
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, can, is } = useAuth();
  const { data: unread = 0 } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => api.get('/notifications/unread-count').then((response) => response.data.data.count),
    refetchInterval: 60_000,
    enabled: Boolean(user)
  });
  const items = navigation.map((item) => {
    if (!item.children) return itemAllowed(item, can, is, user) ? item : null;
    const children = item.children.filter((child) => itemAllowed(child, can, is, user));
    return children.length ? { ...item, children } : null;
  }).filter(Boolean);
  const links = items.flatMap((item) => item.children || [item]);
  const sections = ['Overview', 'CRM', 'Projects', 'Tasks', 'Finance', 'Recruitment', 'Communications', 'Workspace', 'Letters', 'Reports', 'Settings']
    .filter((section) => items.some((item) => item.section === section));
  const current = links.find((item) => item.path !== '/' && pathActive(location.pathname, item.path, item.exact))
    || (location.pathname.startsWith('/tasks/') ? { label: 'Task details' } : null)
    || (location.pathname.startsWith('/crm/') ? { label: 'CRM' } : null);
  const groupActive = (item) => item.children.some((child) => pathActive(location.pathname, child.path, child.exact))
    || (item.section === 'Tasks' && location.pathname.startsWith('/tasks'))
    || (item.section === 'CRM' && location.pathname.startsWith('/crm'));
  const activeGroup = items.find((item) => item.children && groupActive(item))?.label;
  useEffect(() => {
    if (activeGroup) setOpenGroups((groups) => ({ ...groups, [activeGroup]: true }));
  }, [activeGroup]);
  const drawer = (
    <Box sx={{ width: 280, height: '100%', p: 2.5, display: 'flex', flexDirection: 'column' }} onClick={() => mobile && setOpen(false)}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2, px: 1, py: 1.5, mb: 3 }}>
        <Box sx={{ width: 38, height: 38, borderRadius: 1.5, bgcolor: 'primary.main', color: 'white', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 20 }}>I</Box>
        <Box>
          <Typography fontWeight={800} letterSpacing=".04em">INDONOR</Typography>
          <Typography variant="caption" color="text.secondary">
            {is('VIEW_ADMIN') ? 'VIEW ONLY' : is('EMPLOYEE', 'TEAM_LEAD') ? 'EMPLOYEE PORTAL' : 'HR OPERATIONS'}
          </Typography>
        </Box>
      </Box>
      {sections.map((section) => (
        <Box key={section} sx={{ mb: 0 }}>
          {/* <Typography variant="overline" color="text.secondary" sx={{ px: 1.5, fontSize: 10, letterSpacing: '.12em' }}>{section}</Typography> */}
          <List sx={{ mt: .6, p: 0 }}>
            {items.filter((item) => item.section === section).map((item) => item.children ? (
              <Box key={item.label}>
                <ListItemButton
                  selected={groupActive(item)}
                  onClick={(event) => { event.stopPropagation(); setOpenGroups((groups) => ({ ...groups, [item.label]: !groups[item.label] })); }}
                  sx={navButtonSx}
                >
                  <ListItemIcon sx={{ minWidth: 38, color: groupActive(item) ? 'primary.main' : 'text.secondary' }}>{item.icon}</ListItemIcon>
                  <ListItemText primary={item.label} primaryTypographyProps={{ fontSize: 14, fontWeight: 550 }} />
                  {openGroups[item.label] ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
                </ListItemButton>
                <Collapse in={Boolean(openGroups[item.label])} timeout="auto" unmountOnExit>
                  <List disablePadding>
                    {item.children.map((child) => (
                      <ListItemButton key={child.path} component={NavLink} to={child.path} end={child.exact} selected={pathActive(location.pathname, child.path, child.exact)} sx={{ ...navButtonSx, pl: 4, minHeight: 40 }}>
                        <ListItemIcon sx={{ minWidth: 34, color: 'text.secondary' }}>{child.icon}</ListItemIcon>
                        <ListItemText primary={child.label} primaryTypographyProps={{ fontSize: 13.5, fontWeight: 550 }} />
                      </ListItemButton>
                    ))}
                  </List>
                </Collapse>
              </Box>
            ) : (
              <ListItemButton key={item.path} component={NavLink} to={item.path} selected={pathActive(location.pathname, item.path)} sx={navButtonSx}>
                <ListItemIcon sx={{ minWidth: 38, color: 'text.secondary' }}>{item.icon}</ListItemIcon>
                <ListItemText primary={item.label} primaryTypographyProps={{ fontSize: 14, fontWeight: 550 }} />
              </ListItemButton>
            ))}
          </List>
        </Box>
      ))}
      <Box sx={{ flex: 1 }} />
      <Divider sx={{ my: 1.5 }} />
      <ListItemButton onClick={logout} sx={{ borderRadius: 1.5, px: 1.5 }}>
        <Avatar sx={{ width: 34, height: 34, mr: 1.2, bgcolor: 'primary.light', color: 'primary.dark' }}>{user?.name?.[0]}</Avatar>
        <ListItemText primary={user?.name} secondary="Sign out" primaryTypographyProps={{ fontSize: 14, fontWeight: 650 }} secondaryTypographyProps={{ fontSize: 12 }} />
      </ListItemButton>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="fixed" color="inherit" elevation={0} sx={{ borderBottom: '1px solid', borderColor: 'divider', display: { md: 'none' } }}>
        <Toolbar>
          <IconButton edge="start" onClick={() => setOpen(true)}><MenuOutlined /></IconButton>
          <Typography fontWeight={800} sx={{ flex: 1 }}>INDONOR</Typography>
          <IconButton onClick={() => navigate('/notifications')}><Badge badgeContent={unread} color="error"><NotificationsNoneOutlined /></Badge></IconButton>
        </Toolbar>
      </AppBar>
      {mobile
        ? <Drawer open={open} onClose={() => setOpen(false)}>{drawer}</Drawer>
        : <Drawer variant="permanent" sx={{ width: 280, flexShrink: 0, '& .MuiDrawer-paper': { width: 280, boxSizing: 'border-box', borderRight: '1px solid', borderColor: 'divider' } }}>{drawer}</Drawer>}
      <Box component="main" sx={{ flex: 1, minWidth: 0, pt: { xs: 8, md: 0 } }}>
        <Box sx={{ display: { xs: 'none', md: 'flex' }, height: 64, borderBottom: '1px solid', borderColor: 'divider', alignItems: 'center', justifyContent: 'space-between', px: 4, position: 'sticky', top: 0, bgcolor: 'background.paper', zIndex: 10 }}>
          <Typography color="text.secondary">{current?.label || 'Dashboard'}</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            {is('VIEW_ADMIN') && (
              <Typography variant="caption" sx={{ px: 1, py: 0.4, borderRadius: 1, bgcolor: 'primary.light', color: 'primary.dark', fontWeight: 700 }}>
                Read only
              </Typography>
            )}
            <Tooltip title={unread ? `${unread} unread` : 'Notifications'}>
              <IconButton onClick={() => navigate('/notifications')}><Badge badgeContent={unread} color="error"><NotificationsNoneOutlined /></Badge></IconButton>
            </Tooltip>
            <Avatar sx={{ width: 34, height: 34, bgcolor: 'primary.main' }}>{user?.name?.[0]}</Avatar>
            <Typography fontWeight={650}>{user?.name}</Typography>
          </Box>
        </Box>
        <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 1400 }}><Outlet /></Box>
      </Box>
    </Box>
  );
}
