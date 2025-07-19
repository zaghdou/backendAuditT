'use client';

import { useEffect, useState } from 'react';
import type { RefObject } from 'react';

// MUI Imports
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import CardContent from '@mui/material/CardContent';
import Tooltip from '@mui/material/Tooltip';

// Component Imports
import OptionMenu from '@core/components/option-menu';
import AvatarWithBadge from './AvatarWithBadge';
import { statusObj } from './SidebarLeft';
import ChatLog from './ChatLog';
import SendMsgForm from './SendMsgForm';
import UserProfileRight from './UserProfileRight';
import CustomAvatar from '@core/components/mui/Avatar';

// Type Imports
import type { AppDispatch } from '@/redux-store';
import type { ChatDataType, MessageType } from '@/types/apps/chatTypes';

// Define Agent interface
interface Agent {
  id: string;
  fullName: string;
  role: string;
  avatar?: string;
  avatarColor?: string;
  status: 'online' | 'offline' | 'busy' | 'away';
  complianceCertifications?: ('soc1' | 'soc2' | 'both' | 'none')[];
}

// Define report message type
interface ReportMessage extends MessageType {
  type: 'report';
  reportType: 'soc1' | 'soc2';
  content: string;
}

// Renders the user avatar with badge and user information
const UserAvatar = ({
  activeUser,
  setUserProfileLeftOpen,
  setBackdropOpen
}: {
  activeUser: Agent;
  setUserProfileLeftOpen: (open: boolean) => void;
  setBackdropOpen: (open: boolean) => void;
}) => (
  <div
    className='flex items-center gap-4 cursor-pointer'
    onClick={() => {
      setUserProfileLeftOpen(true);
      setBackdropOpen(true);
    }}
  >
    <AvatarWithBadge
      alt={activeUser?.fullName}
      src={activeUser?.avatar}
      color={activeUser?.avatarColor}
      badgeColor={statusObj[activeUser?.status || 'offline']}
    />
    <div>
      <Typography color='text.primary'>{activeUser?.fullName}</Typography>
      <Typography variant='body2'>{activeUser?.role}</Typography>
      <Typography variant='caption'>
        Certifications: {activeUser?.complianceCertifications?.join(', ') || 'None'}
      </Typography>
    </div>
  </div>
);

interface Props {
  chatStore: ChatDataType;
  dispatch: AppDispatch;
  backdropOpen: boolean;
  setBackdropOpen: (open: boolean) => void;
  setSidebarOpen: (open: boolean) => void;
  isBelowMdScreen: boolean;
  isBelowSmScreen: boolean;
  isBelowLgScreen: boolean;
  messageInputRef: RefObject<HTMLInputElement>;
}

const ChatContent = (props: Props) => {
  // Props
  const {
    chatStore,
    dispatch,
    backdropOpen,
    setBackdropOpen,
    setSidebarOpen,
    isBelowMdScreen,
    isBelowSmScreen,
    isBelowLgScreen,
    messageInputRef
  } = props;

  const { activeUser } = chatStore;

  // States
  const [userProfileRightOpen, setUserProfileRightOpen] = useState(false);

  // Close user profile right drawer if backdrop is closed and user profile right drawer is open
  useEffect(() => {
    if (!backdropOpen && userProfileRightOpen) {
      setUserProfileRightOpen(false);
    }
  }, [backdropOpen]);

  // Generate a mission report for SOC 1 or SOC 2
  const handleGenerateReport = (reportType: 'soc1' | 'soc2') => {
    if (!activeUser) {
      console.error('No active user selected');
      return;
    }

    const certifications = activeUser.complianceCertifications ?? [];
    if (
      (reportType === 'soc1' && !certifications.includes('soc1') && !certifications.includes('both')) ||
      (reportType === 'soc2' && !certifications.includes('soc2') && !certifications.includes('both'))
    ) {
      console.error(`Agent ${activeUser.fullName} is not certified for ${reportType.toUpperCase()}`);
      return;
    }

    const reportContent = reportType === 'soc1' ? `
**SOC 1 Compliance Report**
- **Agent**: ${activeUser.fullName}
- **Report ID**: SOC1-${Date.now()}
- **Date**: ${new Date().toLocaleDateString()}
- **Objective**: Assess controls relevant to financial reporting
- **Status**: In Progress
- **Details**:
  - Reviewed financial data integrity controls at 0900 hours.
  - Verified access control policies for sensitive financial systems.
  - Audited transaction logs for compliance with GAAP standards.
- **Findings**:
  - All controls are operating effectively.
  - Minor discrepancies in audit trails resolved.
- **Next Steps**:
  - Finalize report and submit to compliance officer by 1700 hours.
` : `
**SOC 2 Compliance Report**
- **Agent**: ${activeUser.fullName}
- **Report ID**: SOC2-${Date.now()}
- **Date**: ${new Date().toLocaleDateString()}
- **Objective**: Evaluate security and data protection controls
- **Status**: In Progress
- **Details**:
  - Conducted security assessment at 1000 hours.
  - Tested encryption protocols for data at rest and in transit.
  - Reviewed incident response plan for compliance with SOC 2 criteria.
- **Findings**:
  - Security controls meet SOC 2 standards.
  - Identified one minor vulnerability in access management, patched immediately.
- **Next Steps**:
  - Document findings and schedule follow-up audit.
`;

    const reportMessage: ReportMessage = {
      id: Date.now().toString(),
      senderId: 'agent-system',
      receiverId: activeUser.id,
      content: reportContent,
      time: new Date(),
      type: 'report',
      reportType
    };

    // Dispatch report to chat store
    dispatch({
      type: 'ADD_MESSAGE',
      payload: {
        chatId: activeUser.id,
        message: reportMessage
      }
    });
  };

  return !chatStore.activeUser ? (
    <CardContent className='flex flex-col flex-auto items-center justify-center bs-full gap-[18px]'>
      <CustomAvatar variant='circular' size={98} color='primary' skin='light'>
        <i className='ri-wechat-line text-[50px]' />
      </CustomAvatar>
      <Typography className='text-center'>Select a contact to start a conversation.</Typography>
      {isBelowMdScreen && (
        <Button
          variant='contained'
          className='rounded-full'
          onClick={() => {
            setSidebarOpen(true);
            isBelowSmScreen ? setBackdropOpen(false) : setBackdropOpen(true);
          }}
        >
          Select Contact
        </Button>
      )}
    </CardContent>
  ) : (
    <>
      {activeUser && (
        <div className='flex flex-col flex-grow bs-full'>
          <div className='flex items-center justify-between border-be plb-[17px] pli-5 bg-[var(--mui-palette-customColors-chatBg)]'>
            {isBelowMdScreen ? (
              <div className='flex items-center gap-4'>
                <IconButton
                  onClick={() => {
                    setSidebarOpen(true);
                    setBackdropOpen(true);
                  }}
                >
                  <i className='ri-menu-line text-textSecondary text-xl' />
                </IconButton>
                <UserAvatar
                  activeUser={activeUser}
                  setBackdropOpen={setBackdropOpen}
                  setUserProfileLeftOpen={setUserProfileRightOpen}
                />
              </div>
            ) : (
              <UserAvatar
                activeUser={activeUser}
                setBackdropOpen={setBackdropOpen}
                setUserProfileLeftOpen={setUserProfileRightOpen}
              />
            )}
            <div className='flex items-center gap-1'>
              {!isBelowMdScreen && (
                <>
                  <IconButton size='small'>
                    <i className='ri-phone-line text-textSecondary' />
                  </IconButton>
                  <IconButton size='small'>
                    <i className='ri-video-add-line text-textSecondary' />
                  </IconButton>
                  <IconButton size='small'>
                    <i className='ri-search-line text-textSecondary' />
                  </IconButton>
                </>
              )}
              <OptionMenu
                iconButtonProps={{ size: 'small' }}
                iconClassName='ri-file-text-line text-textSecondary'
                options={[
                  {
                    text: 'Generate SOC 1 Report',
                    menuItemProps: {
                      onClick: () => handleGenerateReport('soc1'),
                      disabled: !(activeUser.complianceCertifications?.includes('soc1') || activeUser.complianceCertifications?.includes('both'))
                    }
                  },
                  {
                    text: 'Generate SOC 2 Report',
                    menuItemProps: {
                      onClick: () => handleGenerateReport('soc2'),
                      disabled: !(activeUser.complianceCertifications?.includes('soc2') || activeUser.complianceCertifications?.includes('both'))
                    }
                  }
                ]}
              />
              <OptionMenu
                iconClassName='text-textSecondary'
                options={[
                  {
                    text: 'View Contact',
                    menuItemProps: {
                      onClick: () => {
                        setUserProfileRightOpen(true);
                        setBackdropOpen(true);
                      }
                    }
                  },
                  'Mute Notifications',
                  'Block Contact',
                  'Clear Chat',
                  'Block'
                ]}
              />
            </div>
          </div>

          <ChatLog
            chatStore={chatStore}
            isBelowMdScreen={isBelowMdScreen}
            isBelowSmScreen={isBelowSmScreen}
            isBelowLgScreen={isBelowLgScreen}
          />

          <SendMsgForm
            dispatch={dispatch}
            activeUser={activeUser}
            isBelowSmScreen={isBelowSmScreen}
            messageInputRef={messageInputRef}
          />
        </div>
      )}

      {activeUser && (
        <UserProfileRight
          open={userProfileRightOpen}
          handleClose={() => {
            setUserProfileRightOpen(false);
            setBackdropOpen(false);
          }}
          activeUser={activeUser}
          isBelowSmScreen={isBelowSmScreen}
          isBelowLgScreen={isBelowLgScreen}
        />
      )}
    </>
  );
};

export default ChatContent;

