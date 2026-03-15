import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Header,
  HeaderMenuButton,
  HeaderName,
  HeaderGlobalBar,
  HeaderGlobalAction,
  SideNav,
  SideNavItems,
  SideNavLink,
  SideNavMenu,
  SideNavMenuItem,
  SkipToContent,
} from '@carbon/react';
import {
  Dashboard,
  Notification,
  NotificationFilled,
  Logout,
  Chip,
  Network_1,
  Home,
  VideoPlayer,
  DataVolume,
  MachineLearning,
  Terminal,
} from '@carbon/icons-react';
import { useAuth, useNotif } from '../../App';

const ROLE_ICONS = {
  network:        Network_1,
  'home-automation': Home,
  media:          VideoPlayer,
  storage:        DataVolume,
  'ai-brain':     MachineLearning,
};

export default function AppShell({ children }) {
  const [sideNavOpen, setSideNavOpen] = useState(false);
  const { user, logout }              = useAuth();
  const { unreadCount, openPanel }    = useNotif();
  const navigate                      = useNavigate();
  const location                      = useLocation();

  const [pis, setPis] = React.useState([]);

  React.useEffect(() => {
    import('../../api').then(({ config }) =>
      config.get().then(d => setPis(d.pis)).catch(() => {})
    );
  }, []);

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <>
      <Header aria-label="Pi Fleet">
        <SkipToContent />
        <HeaderMenuButton
          aria-label={sideNavOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setSideNavOpen(v => !v)}
          isActive={sideNavOpen}
        />
        <HeaderName as={Link} to="/dashboard" prefix="Pi">
          Fleet
        </HeaderName>

        <HeaderGlobalBar>
          <HeaderGlobalAction
            aria-label={`Notifications${unreadCount ? ` (${unreadCount})` : ''}`}
            tooltipAlignment="end"
            onClick={openPanel}
          >
            {unreadCount > 0
              ? <NotificationFilled size={20} style={{ color: '#f1c21b' }} />
              : <Notification size={20} />
            }
          </HeaderGlobalAction>

          <HeaderGlobalAction
            aria-label={`Sign out (${user?.username})`}
            tooltipAlignment="end"
            onClick={handleLogout}
          >
            <Logout size={20} />
          </HeaderGlobalAction>
        </HeaderGlobalBar>
      </Header>

      <SideNav
        aria-label="Side navigation"
        expanded={sideNavOpen}
        onSideNavBlur={() => setSideNavOpen(false)}
        isPersistent={false}
      >
        <SideNavItems>
          <SideNavLink
            renderIcon={Dashboard}
            as={Link}
            to="/dashboard"
            isActive={location.pathname === '/dashboard'}
            onClick={() => setSideNavOpen(false)}
          >
            Dashboard
          </SideNavLink>

          {pis.length > 0 && (
            <SideNavMenu renderIcon={Chip} title="Managed Pis" defaultExpanded>
              {pis.map(pi => {
                const Icon = ROLE_ICONS[pi.role] || Terminal;
                return (
                  <SideNavMenuItem
                    key={pi.id}
                    as={Link}
                    to={`/pi/${pi.id}`}
                    isActive={location.pathname === `/pi/${pi.id}`}
                    onClick={() => setSideNavOpen(false)}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Icon size={16} />
                      {pi.name}
                    </span>
                  </SideNavMenuItem>
                );
              })}
            </SideNavMenu>
          )}
        </SideNavItems>
      </SideNav>

      <div className="cds--content" style={{ paddingTop: 0, background: '#161616', minHeight: 'calc(100vh - 3rem)' }}>
        {children}
      </div>
    </>
  );
}
