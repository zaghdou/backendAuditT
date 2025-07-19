'use client';

// MUI Imports
import {
  Card, CardContent, Grid, Typography, Button, Alert, Select, MenuItem,
  FormControl, InputLabel, CircularProgress, Dialog, DialogContent,
  DialogTitle, DialogActions, IconButton, Box, Chip, Divider, List,
  ListItem, ListItemText, ListItemAvatar, Avatar, Tooltip
} from '@mui/material';
import { styled } from '@mui/system';

// Third-party Imports
import axios from 'axios';
import { toast } from 'react-toastify';

// React Imports
import { useState, useEffect, useCallback } from 'react';

// Icons
import CloseIcon from '@mui/icons-material/Close';
import GroupIcon from '@mui/icons-material/Group';
import InfoIcon from '@mui/icons-material/Info';
import BusinessIcon from '@mui/icons-material/Business';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import AssignmentIcon from '@mui/icons-material/Assignment';
import DeleteIcon from '@mui/icons-material/Delete';
import PersonIcon from '@mui/icons-material/Person';

// --- TYPES ---
interface TeamMemberInfo {
  user_name: string;
  role: string;
}

interface Mission {
  id: number;
  mission_name: string;
  client_name: string;
  fiscal_year: string;
  status: 'active' | 'inactive' | 'pending';
  price: number;
  number_of_report: number;
  team_member_count: number;
  team_members: TeamMemberInfo[];
}

interface User {
  id: number;
  username: string;
  fullname: string;
}

interface TeamMember extends TeamMemberInfo {
  id: number;
  mission_id: number;
  user_id: number;
}

// --- CONFIGURATION ---
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,
});

// --- STYLED COMPONENTS ---
const MissionCard = styled(Card)(({ theme }) => ({
  transition: 'transform 0.3s ease, box-shadow 0.3s ease',
  border: `1px solid ${theme.palette.divider}`,
  borderRadius: theme.shape.borderRadius * 2,
  background: 'linear-gradient(145deg, #ffffff, #f9f9f9)',
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  '&:hover': {
    transform: 'translateY(-5px)',
    boxShadow: theme.shadows[8],
  },
}));

const CardHeaderStyled = styled(Box)(({ theme }) => ({
  padding: theme.spacing(2, 3),
  backgroundColor: theme.palette.primary.light,
  color: theme.palette.primary.contrastText,
  borderTopLeftRadius: theme.shape.borderRadius * 2,
  borderTopRightRadius: theme.shape.borderRadius * 2,
}));

const CardFooter = styled(Box)(({ theme }) => ({
  display: 'flex',
  justifyContent: 'space-around',
  padding: theme.spacing(1.5),
  borderTop: `1px solid ${theme.palette.divider}`,
  marginTop: 'auto',
}));

const DetailItem = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  marginBottom: theme.spacing(1.5),
  color: theme.palette.text.secondary,
  '& .MuiSvgIcon-root': {
    marginRight: theme.spacing(1.5),
    color: theme.palette.primary.main,
  },
}));

// --- COMPOSANT PRINCIPAL ---
const MissionDashboard: React.FC = () => {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [selectedMission, setSelectedMission] = useState<Mission | null>(null);
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogLoading, setDialogLoading] = useState(false);
  const [isTeamDialogOpen, setTeamDialogOpen] = useState(false);
  const [isDetailDialogOpen, setDetailDialogOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [missionsData, usersData, rolesData] = await Promise.all([
        axiosInstance.get('/api/missions'),
        axiosInstance.get('/api/users'),
        axiosInstance.get('/api/roles'),
      ]);
      setMissions(missionsData.data.missions || []);
      setUsers(usersData.data.users || []);
      setRoles((rolesData.data.roles || []).map((role: string) => role.toLowerCase()));
      if (!missionsData.data.missions?.length) {
        toast.warn('No projects found.');
      }
    } catch (err: any) {
      const message = err.response?.data?.error || 'Failed to fetch initial data.';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTeamMembers = useCallback(async (missionId: number) => {
    setDialogLoading(true);
    try {
      const response = await axiosInstance.get(`/api/team-members?mission_id=${missionId}`);
      setTeamMembers(response.data.team_members || []);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to fetch team members.');
      setTeamMembers([]);
    } finally {
      setDialogLoading(false);
    }
  }, []);

  const handleAddTeamMember = async () => {
    if (!selectedMission || !selectedUser || !selectedRole) {
      toast.error('Please select a user and a role.');
      return;
    }
    setDialogLoading(true);
    try {
      const userId = parseInt(selectedUser);
      const payload = {
        role: selectedRole.toLowerCase(),
        mission_id: selectedMission.id,
        user_id: userId,
      };
      await axiosInstance.post('/api/team-members', payload);
      toast.success('Member added successfully!');
      setSelectedUser('');
      setSelectedRole('');
      await fetchTeamMembers(selectedMission.id);
      await fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to add member.');
    } finally {
      setDialogLoading(false);
    }
  };

  const handleDeleteTeamMember = async (teamMemberId: number) => {
    if (!window.confirm('Are you sure you want to remove this team member?')) return;
    setDialogLoading(true);
    try {
        await axiosInstance.delete(`/api/team-members/${teamMemberId}`);
        toast.success('Member removed successfully!');
        if (selectedMission) {
            await fetchTeamMembers(selectedMission.id);
        }
        await fetchData();
    } catch (err: any) {
        toast.error(err.response?.data?.error || 'Failed to remove member.');
    } finally {
        setDialogLoading(false);
    }
  }

  const handleOpenTeamDialog = (mission: Mission) => {
    setSelectedMission(mission);
    fetchTeamMembers(mission.id);
    setTeamDialogOpen(true);
  };

  const handleOpenDetailDialog = (mission: Mission) => {
    setSelectedMission(mission);
    setDetailDialogOpen(true);
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading && !missions.length) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
        <CircularProgress size={48} />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ m: 4 }} onClose={() => setError(null)}>
        {error}
      </Alert>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 4 } }}>
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 700, mb: 4, color: 'text.primary' }}>
        Missions Dashboard
      </Typography>
      <Grid container spacing={4}>
        {missions.map(mission => (
          <Grid item xs={12} sm={6} md={4} key={mission.id}>
            <MissionCard>
              <CardHeaderStyled>
                <Typography variant="h6" noWrap sx={{ fontWeight: 600 }}>
                  {mission.mission_name}
                </Typography>
                <Chip
                  label={mission.status.toUpperCase()}
                  color={mission.status === 'active' ? 'success' : 'warning'}
                  size="small"
                  sx={{ mt: 1 }}
                />
              </CardHeaderStyled>
              <CardContent sx={{ p: 3, flexGrow: 1 }}>
                <DetailItem>
                  <BusinessIcon fontSize="small" />
                  <Typography variant="body2">Client: {mission.client_name}</Typography>
                </DetailItem>
                <DetailItem>
                  <CalendarTodayIcon fontSize="small" />
                  <Typography variant="body2">Fiscal Year: {mission.fiscal_year}</Typography>
                </DetailItem>
                <DetailItem>
                  <AttachMoneyIcon fontSize="small" />
                  <Typography variant="body2">Price: {mission.price?.toFixed(2) || 'N/A'} €</Typography>
                </DetailItem>
                <DetailItem>
                  <AssignmentIcon fontSize="small" />
                  <Typography variant="body2">{mission.number_of_report} Reports</Typography>
                </DetailItem>
                <DetailItem>
                  <GroupIcon fontSize="small" />
                  <Typography variant="body2">{mission.team_member_count} Members</Typography>
                </DetailItem>
              </CardContent>
              <CardFooter>
                <Button
                  size="small"
                  onClick={() => handleOpenDetailDialog(mission)}
                  startIcon={<InfoIcon />}
                >
                  Details
                </Button>
                <Button
                  size="small"
                  onClick={() => handleOpenTeamDialog(mission)}
                  startIcon={<GroupIcon />}
                >
                  Manage Team
                </Button>
              </CardFooter>
            </MissionCard>
          </Grid>
        ))}
      </Grid>

      <Dialog open={isTeamDialogOpen} onClose={() => setTeamDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          Manage Team for "{selectedMission?.mission_name}"
          <IconButton onClick={() => setTeamDialogOpen(false)} sx={{ position: 'absolute', right: 8, top: 8 }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {dialogLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}><CircularProgress /></Box>
          ) : (
            <>
              <Typography variant="h6" sx={{ mb: 2 }}>Current Members</Typography>
              <List dense>
                {teamMembers.length > 0 ? (
                  teamMembers.map(member => (
                    <ListItem
                      key={member.id}
                      secondaryAction={
                        <Tooltip title="Remove Member">
                          <IconButton edge="end" aria-label="delete" onClick={() => handleDeleteTeamMember(member.id)}>
                            <DeleteIcon color="error" />
                          </IconButton>
                        </Tooltip>
                      }
                    >
                      <ListItemAvatar>
                        <Avatar><PersonIcon /></Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={member.user_name}
                        secondary={member.role.replace('_', ' ').toUpperCase()}
                      />
                    </ListItem>
                  ))
                ) : (
                  <Typography color="text.secondary" sx={{ p: 2 }}>No team members assigned.</Typography>
                )}
              </List>

              <Divider sx={{ my: 3 }} />

              <Typography variant="h6" sx={{ mb: 2 }}>Add New Member</Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth>
                    <InputLabel>User</InputLabel>
                    <Select
                      value={selectedUser}
                      onChange={e => setSelectedUser(e.target.value)}
                      label="User"
                    >
                      <MenuItem value=""><em>Select a user</em></MenuItem>
                      {users.map(user => (
                        <MenuItem key={user.id} value={user.id}>
                          {user.fullname}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth>
                    <InputLabel>Role</InputLabel>
                    <Select
                      value={selectedRole}
                      onChange={e => setSelectedRole(e.target.value)}
                      label="Role"
                    >
                      <MenuItem value=""><em>Select a role</em></MenuItem>
                      {roles.map(role => (
                        <MenuItem key={role} value={role}>
                          {role.replace('_', ' ').toUpperCase()}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12}>
                  <Button
                    variant="contained"
                    onClick={handleAddTeamMember}
                    fullWidth
                    disabled={dialogLoading}
                  >
                    {dialogLoading ? <CircularProgress size={24} color="inherit" /> : 'Add Member'}
                  </Button>
                </Grid>
              </Grid>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTeamDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={isDetailDialogOpen} onClose={() => setDetailDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          Mission Details
          <IconButton onClick={() => setDetailDialogOpen(false)} sx={{ position: 'absolute', right: 8, top: 8 }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {selectedMission && (
            <Grid container spacing={2}>
              <Grid item xs={12}><Typography variant="h6">{selectedMission.mission_name}</Typography></Grid>
              <Grid item xs={12} sm={6}><Typography><strong>Client:</strong> {selectedMission.client_name}</Typography></Grid>
              <Grid item xs={12} sm={6}><Typography><strong>Fiscal Year:</strong> {selectedMission.fiscal_year}</Typography></Grid>
              <Grid item xs={12} sm={6}><Typography><strong>Price:</strong> {selectedMission.price?.toFixed(2) || 'N/A'} €</Typography></Grid>
              <Grid item xs={12} sm={6}><Typography><strong>Status:</strong> <Chip label={selectedMission.status.toUpperCase()} color={selectedMission.status === 'active' ? 'success' : 'warning'} size="small" /></Typography></Grid>
              <Grid item xs={12}><Divider sx={{ my: 2 }} /></Grid>
              <Grid item xs={12}><Typography variant="h6">Team Members ({selectedMission.team_member_count})</Typography></Grid>
              {selectedMission.team_members.length > 0 ? (
                selectedMission.team_members.map((member, index) => (
                  <Grid item xs={12} sm={6} key={index}>
                    <Typography>- {member.user_name} ({member.role.replace('_', ' ').toUpperCase()})</Typography>
                  </Grid>
                ))
              ) : (
                <Grid item xs={12}><Typography>No members assigned.</Typography></Grid>
              )}
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default MissionDashboard;
