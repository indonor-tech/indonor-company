import React, { useEffect, useState } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AppBar, Avatar, Badge, Box, Collapse, Divider, Drawer, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Toolbar, Tooltip, Typography, useMediaQuery, useTheme } from '@mui/material';
import { AccountTreeOutlined, ArticleOutlined, AssessmentOutlined, AssignmentOutlined, BadgeOutlined, CalendarMonthOutlined, ChecklistOutlined, DashboardOutlined, DescriptionOutlined, EditCalendarOutlined, EmailOutlined, EventNoteOutlined, ExpandLess, ExpandMore, FactCheckOutlined, FolderOutlined, GroupOutlined, HistoryOutlined, HowToRegOutlined, LanguageOutlined, ListAltOutlined, ManageAccountsOutlined, NotificationsNoneOutlined, PersonOutlined, RateReviewOutlined, SettingsOutlined, TaskAltOutlined, WorkOutlineOutlined } from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';

const navButtonSx = {
  borderRadius: 1.5,
  minHeight: 44,
  mb: .4,
  '&.active': { bgcolor: 'primary.light', color: 'primary.dark', '& .MuiListItemIcon-root': { color: 'primary.main' } }
};

const navigation = [
  { label: 'Dashboard', path: '/', icon: <DashboardOutlined />, section: 'Overview' },
  { label: 'My profile', path: '/me', icon: <PersonOutlined />, section: 'Overview' },
  { label: 'Employees', path: '/employees', icon: <GroupOutlined />, section: 'Management', permission: 'employee:read' },
  { label: 'Recruitment', path: '/candidates', icon: <HowToRegOutlined />, section: 'Management', permission: 'candidate:read' },
  { label: 'Pipeline', path: '/pipeline', icon: <AccountTreeOutlined />, section: 'Management', permission: 'candidate:read' },
  { label: 'Interviews', path: '/interviews', icon: <CalendarMonthOutlined />, section: 'Management', permission: 'interview:read' },
  { label: 'Offer letter', path: '/letters/offer', icon: <DescriptionOutlined />, section: 'Letters', permissionAny: ['employee:update', 'candidate:update'] },
  { label: 'Agreement letter', path: '/letters/agreement', icon: <AssignmentOutlined />, section: 'Letters', permission: 'employee:update' },
  { label: 'Relieving letter', path: '/letters/relieving', icon: <ArticleOutlined />, section: 'Letters', permission: 'employee:update' },
  { label: 'Company card', path: '/letters/company-card', icon: <BadgeOutlined />, section: 'Letters', permission: 'employee:update' },
  {
    label: 'Task Management',
    icon: <TaskAltOutlined />,
    section: 'Tasks',
    children: [
      { label: 'Dashboard', path: '/tasks', exact: true, icon: <DashboardOutlined />, permission: 'task:read' },
      { label: 'My Tasks', path: '/tasks/my', icon: <ChecklistOutlined />, permission: 'task:read' },
      { label: 'All Tasks', path: '/tasks/all', icon: <ListAltOutlined />, permissionAny: ['task:read:all', 'task:read:team'] },
      { label: 'Daily Work Logs', path: '/tasks/work-logs', icon: <EventNoteOutlined />, permission: 'task:read' },
      { label: 'Calendar', path: '/tasks/calendar', icon: <CalendarMonthOutlined />, permission: 'task:read' },
      { label: 'Projects', path: '/tasks/projects', icon: <FolderOutlined />, permission: 'task:read' },
      { label: 'Corrections', path: '/tasks/corrections', icon: <RateReviewOutlined />, permission: 'task:read' },
      { label: 'Reports', path: '/tasks/reports', icon: <FactCheckOutlined />, permission: 'task:reports:read' },
      { label: 'Audit History', path: '/tasks/audit', icon: <HistoryOutlined />, permission: 'task:audit:read' },
      { label: 'Calendar setup', path: '/tasks/setup', icon: <EditCalendarOutlined />, permission: 'task:calendar:manage' }
    ]
  },
  {
    label: 'Website',
    icon: <LanguageOutlined />,
    section: 'Workspace',
    children: [
      { label: 'Enquiries', path: '/contact-submissions', icon: <EmailOutlined />, permission: 'contact:read' },
      { label: 'Traffic', path: '/website-analytics', icon: <LanguageOutlined />, permission: 'analytics:read' },
      { label: 'Team', path: '/website-team', icon: <GroupOutlined />, permission: 'website:read' },
      { label: 'Projects', path: '/website-projects', icon: <WorkOutlineOutlined />, permission: 'website:read' }
    ]
  },
  { label: 'Email', path: '/email', icon: <EmailOutlined />, section: 'Workspace', permission: 'email:send' },
  { label: 'Notifications', path: '/notifications', icon: <NotificationsNoneOutlined />, section: 'Workspace' },
  { label: 'Departments & skills', path: '/catalogs', icon: <AccountTreeOutlined />, section: 'Workspace', permission: 'catalog:read' },
  { label: 'Reports', path: '/reports', icon: <AssessmentOutlined />, section: 'Workspace', permission: 'reports:read' },
  { label: 'CRM users', path: '/users', icon: <ManageAccountsOutlined />, section: 'Workspace', permission: 'users:read' },
  { label: 'Settings', path: '/settings', icon: <SettingsOutlined />, section: 'Workspace', roles: ['SUPER_ADMIN', 'ADMIN'] }
];

function itemAllowed(item, can, is) {
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
    if (!item.children) return itemAllowed(item, can, is) ? item : null;
    const children = item.children.filter((child) => itemAllowed(child, can, is));
    return children.length ? { ...item, children } : null;
  }).filter(Boolean);
  const links = items.flatMap((item) => item.children || [item]);
  const sections = ['Overview', 'Tasks', 'Management', 'Letters', 'Workspace'].filter((section) => items.some((item) => item.section === section));
  const current = links.find((item) => item.path !== '/' && pathActive(location.pathname, item.path, item.exact))
    || (location.pathname.startsWith('/tasks/') ? { label: 'Task details' } : null);
  const groupActive = (item) => item.children.some((child) => pathActive(location.pathname, child.path, child.exact)) || (item.section === 'Tasks' && location.pathname.startsWith('/tasks'));
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
          <Typography variant="caption" color="text.secondary">{is('EMPLOYEE', 'TEAM_LEAD') ? 'EMPLOYEE PORTAL' : 'HR OPERATIONS'}</Typography>
        </Box>
      </Box>
      {sections.map((section) => (
        <Box key={section} sx={{ mb: 2 }}>
          <Typography variant="overline" color="text.secondary" sx={{ px: 1.5, fontSize: 10, letterSpacing: '.12em' }}>{section}</Typography>
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
      <Divider sx={{ my: 2 }} />
      <Typography variant="caption" color="text.secondary" sx={{ px: 1.5 }}>ACCOUNT</Typography>
      <ListItemButton onClick={logout} sx={{ mt: .8, borderRadius: 1.5, px: 1.5 }}>
        <Avatar sx={{ width: 34, height: 34, mr: 1.5, bgcolor: 'secondary.main', color: 'text.primary' }}>{user?.name?.[0]}</Avatar>
        <ListItemText primary={user?.name} secondary="Sign out" primaryTypographyProps={{ fontSize: 14, fontWeight: 650 }} />
      </ListItemButton>
    </Box>
  );
  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar position="fixed" color="inherit" elevation={0} sx={{ borderBottom: '1px solid #e8edf0', display: { md: 'none' } }}>
        <Toolbar>
          <IconButton onClick={() => setOpen(true)}><Typography>☰</Typography></IconButton>
          <Typography fontWeight={800} sx={{ flex: 1 }}>INDONOR</Typography>
          <IconButton onClick={() => navigate('/notifications')}><Badge badgeContent={unread} color="error" max={99}><NotificationsNoneOutlined fontSize="small" /></Badge></IconButton>
        </Toolbar>
      </AppBar>
      {mobile ? <Drawer open={open} onClose={() => setOpen(false)}>{drawer}</Drawer> : <Drawer variant="permanent" sx={{ '& .MuiDrawer-paper': { width: 280, border: 0, borderRight: '1px solid #e8edf0' } }}>{drawer}</Drawer>}
      <Box component="main" sx={{ flex: 1, minWidth: 0, ml: { md: '280px' }, pt: { xs: 9, md: 0 } }}>
        <Box sx={{ display: { xs: 'none', md: 'flex' }, height: 72, borderBottom: '1px solid #e8edf0', alignItems: 'center', justifyContent: 'space-between', px: 5, gap: 2, bgcolor: 'background.paper' }}>
          <Typography variant="body2" color="text.secondary">People operations / {current?.label || 'Dashboard'}</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Tooltip title={unread ? `${unread} unread notification${unread > 1 ? 's' : ''}` : 'Notifications'}>
              <IconButton onClick={() => navigate('/notifications')}><Badge badgeContent={unread} color="error" max={99}><NotificationsNoneOutlined fontSize="small" /></Badge></IconButton>
            </Tooltip>
            <Avatar sx={{ width: 34, height: 34, bgcolor: 'primary.main' }}>{user?.name?.[0]}</Avatar>
            <Typography fontWeight={650} fontSize={14}>{user?.name}</Typography>
          </Box>
        </Box>
        <Box sx={{ p: { xs: 2, md: 5 }, maxWidth: 1600 }}><Outlet /></Box>
      </Box>
    </Box>
  );
}
