'use client';

// Next Imports
import { useParams } from 'next/navigation';

// MUI Imports
import { useTheme } from '@mui/material/styles';
import Chip from '@mui/material/Chip';

// Third-party Imports
import PerfectScrollbar from 'react-perfect-scrollbar';

// Type Imports
import type { VerticalMenuContextProps } from '@menu/components/vertical-menu/Menu';

// Component Imports
import { Menu, SubMenu, MenuItem, MenuSection } from '@menu/vertical-menu';

// Hook Imports
import useVerticalNav from '@menu/hooks/useVerticalNav';

// Styled Component Imports
import StyledVerticalNavExpandIcon from '@menu/styles/vertical/StyledVerticalNavExpandIcon';

// Style Imports
import menuItemStyles from '@core/styles/vertical/menuItemStyles';
import menuSectionStyles from '@core/styles/vertical/menuSectionStyles';

// Dictionary Type
type NavigationDictionary = {
  navigation: {
    home: string;
    management: string;
    projectManagement: string;
    customerManagement: string;
    reportManagement: string;
    administration: string;
    userManagement: string;
    agentIAManagement: string;
    category: string;
    list: string;
    add: string;
    details: string;
    edit: string;
    view: string;
    rolesPermissions: string;
    roles: string;
    permissions: string;
    teamMembers: string;
  };
};

type RenderExpandIconProps = {
  open?: boolean;
  transitionDuration?: VerticalMenuContextProps['transitionDuration'];
};

type Props = {
  dictionary: NavigationDictionary;
  scrollMenu: (container: any, isPerfectScrollbar: boolean) => void;
};

const RenderExpandIcon = ({ open, transitionDuration }: RenderExpandIconProps) => (
  <StyledVerticalNavExpandIcon open={open} transitionDuration={transitionDuration}>
    <i className='ri-arrow-right-s-line' />
  </StyledVerticalNavExpandIcon>
);

const VerticalMenu = ({ dictionary, scrollMenu }: Props) => {
  // Hooks
  const theme = useTheme();
  const verticalNavOptions = useVerticalNav();
  const params = useParams();

  // Vars
  const { isBreakpointReached, transitionDuration } = verticalNavOptions;
  const { lang: locale } = params;

  const ScrollWrapper = isBreakpointReached ? 'div' : PerfectScrollbar;

  return (
    <ScrollWrapper
      {...(isBreakpointReached
        ? {
            className: 'bs-full overflow-y-auto overflow-x-hidden',
            onScroll: container => scrollMenu(container, false),
          }
        : {
            options: { wheelPropagation: false, suppressScrollX: true },
            onScrollY: container => scrollMenu(container, true),
          })}
    >
      <Menu
        popoutMenuOffset={{ mainAxis: 17 }}
        menuItemStyles={menuItemStyles(verticalNavOptions, theme)}
        renderExpandIcon={({ open }) => <RenderExpandIcon open={open} transitionDuration={transitionDuration} />}
        renderExpandedMenuItemIcon={{ icon: <i className='ri-circle-fill' /> }}
        menuSectionStyles={menuSectionStyles(verticalNavOptions, theme)}
      >
        <MenuItem
          href={`/${locale}/dashboards/crm`}
          icon={<i className='ri-home-smile-line' />}
          suffix={<Chip label='New' size='small' color='error' />}
        >
          {dictionary.navigation.home}
        </MenuItem>
        <MenuSection label={dictionary.navigation.management}>
          <SubMenu label={dictionary.navigation.projectManagement} icon={<i className='ri-task-line' />}>
            <MenuItem href={`/${locale}/apps/roles`}>{dictionary.navigation.teamMembers}</MenuItem>
            <MenuItem href={`/${locale}/apps/ecommerce/products/list`}>{dictionary.navigation.list}</MenuItem>
            <MenuItem href={`/${locale}/apps/ecommerce/products/add`}>{dictionary.navigation.add}</MenuItem>
          </SubMenu>
          <SubMenu label={dictionary.navigation.customerManagement} icon={<i className='ri-group-line' />}>
            <MenuItem href={`/${locale}/apps/ecommerce/customers/list`}>{dictionary.navigation.list}</MenuItem>
            <MenuItem
              href={`/${locale}/apps/ecommerce/customers/details/879861`}
              exactMatch={false}
              activeUrl='/apps/ecommerce/customers/details'
            >
              {dictionary.navigation.details}
            </MenuItem>
          </SubMenu>
          <SubMenu label={dictionary.navigation.reportManagement} icon={<i className='ri-bar-chart-line' />}>
            <MenuItem href={`/${locale}/apps/invoice/list`}>{dictionary.navigation.list}</MenuItem>
            <MenuItem
              href={`/${locale}/apps/invoice/edit/4987`}
              exactMatch={false}
              activeUrl='/apps/invoice/edit'
            >
              {dictionary.navigation.edit}
            </MenuItem>
            <MenuItem href={`/${locale}/apps/invoice/add`}>{dictionary.navigation.add}</MenuItem>
          </SubMenu>
        </MenuSection>
        <MenuSection label={dictionary.navigation.administration}>
          <SubMenu label={dictionary.navigation.userManagement} icon={<i className='ri-user-line' />}>
            <MenuItem href={`/${locale}/apps/user/list`}>{dictionary.navigation.list}</MenuItem>
            <MenuItem href={`/${locale}/apps/user/view`}>{dictionary.navigation.view}</MenuItem>
          </SubMenu>
          <SubMenu label={dictionary.navigation.agentIAManagement} icon={<i className='ri-robot-line' />}>
            <MenuItem href={`/${locale}/apps/permissions`}>{dictionary.navigation.list}</MenuItem>
          </SubMenu>
          <SubMenu label={dictionary.navigation.category} icon={<i className='ri-book-2-line' />}>
            <MenuItem href={`/${locale}/apps/ecommerce/products/category`}>{dictionary.navigation.category}</MenuItem>
          </SubMenu>
        </MenuSection>
      </Menu>
    </ScrollWrapper>
  );
};

export default VerticalMenu;
