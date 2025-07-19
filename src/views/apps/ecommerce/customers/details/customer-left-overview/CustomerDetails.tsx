'use client';

import { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import {
  Card,
  CardContent,
  Chip,
  Divider,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Avatar,
} from '@mui/material';
import type { ButtonProps } from '@mui/material/Button';
import EditUserInfo from '@components/dialogs/edit-user-info';
import OpenDialogOnElementClick from '@components/dialogs/OpenDialogOnElementClick';
import type { Customer } from '@/types/apps/ecommerceTypes';

interface Mission {
  id: number;
  mission_name: string;
  fiscal_year: number;
  client_name: string;
  status: string;
  client_id: number;
  number_of_report: number;
  price: number;
}

interface CustomerDetailsProps {
  customerData: Customer;
  missions: Mission[];
  customerId: string;
}

const CustomerDetails = ({ customerData, missions, customerId }: CustomerDetailsProps) => {
  const chartRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstanceRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (chartRef.current && missions.length > 0) {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
      }
      chartInstanceRef.current = new Chart(chartRef.current, {
        type: 'pie',
        data: {
          labels: ['Active', 'Inactive'],
          datasets: [
            {
              data: [
                missions.filter(m => m.status.toLowerCase() === 'active').length,
                missions.filter(m => m.status.toLowerCase() === 'inactive').length,
              ],
              backgroundColor: ['#4CAF50', '#F44336'],
              borderColor: ['#388E3C', '#D32F2F'],
            },
          ],
        },
        options: {
          plugins: {
            legend: { position: 'top' },
            title: { display: true, text: 'Missions by Status' },
          },
        },
      });
    }
    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
      }
    };
  }, [missions]);

  const handleExportClient = async () => {
    console.log('Exporting client with ID:', customerId);
    // Reimplement export logic if needed
  };

  const buttonProps: ButtonProps = {
    variant: 'contained',
    children: 'Edit Details',
  };

  return (
    <Card sx={{ boxShadow: 4, borderRadius: 2, bgcolor: 'background.paper', m: { xs: 2, md: 4 } }}>
      <CardContent className="flex flex-col pbs-12 gap-6">
        <div className="flex flex-col justify-self-center items-center gap-6">
          <div className="flex flex-col items-center gap-4">
            <Avatar
              src={customerData.avatar || undefined}
              variant="rounded"
              alt="Customer Avatar"
              sx={{ width: 120, height: 120 }}
            />
            <div className="flex flex-col items-center text-center">
              <Typography variant="h5">{customerData.customer}</Typography>
              <Typography>Customer ID #{customerData.customerId}</Typography>
            </div>
          </div>
          <div className="flex items-center justify-around gap-4 flex-wrap is-full">
            <div className="flex items-center gap-4">
              <Avatar variant="rounded" sx={{ bgcolor: 'primary.light' }}>
                <i className="ri-shopping-cart-2-line" />
              </Avatar>
              <div>
                <Typography variant="h5">{customerData.order}</Typography>
                <Typography>Projects</Typography>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Avatar variant="rounded" sx={{ bgcolor: 'primary.light' }}>
                <i className="ri-money-dollar-circle-line" />
              </Avatar>
              <div>
                <Typography variant="h5">${customerData.totalSpent.toFixed(2)}</Typography>
                <Typography>Total Mission Price</Typography>
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <Typography variant="h5">Details</Typography>
          <Divider />
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1">
              <Typography color="text.primary" className="font-medium">
                Company Name:
              </Typography>
              <Typography>{customerData.customer}</Typography>
            </div>
            <div className="flex items-center gap-1">
              <Typography color="text.primary" className="font-medium">
                Billing Email:
              </Typography>
              <Typography>{customerData.email}</Typography>
            </div>
            <div className="flex items-center gap-1">
              <Typography color="text.primary" className="font-medium">
                Status:
              </Typography>
              <Chip
                label={customerData.status}
                variant="tonal"
                color={customerData.status === 'active' ? 'success' : 'error'}
                size="small"
              />
            </div>
            <div className="flex items-center gap-1">
              <Typography color="text.primary" className="font-medium">
                Contact:
              </Typography>
              <Typography>N/A</Typography>
            </div>
            <div className="flex items-center gap-1">
              <Typography color="text.primary" className="font-medium">
                Country:
              </Typography>
              <Typography>{customerData.country}</Typography>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <Typography variant="h5">Missions</Typography>
          <Divider />
          {missions.length > 0 ? (
            <>
              <canvas ref={chartRef} style={{ maxHeight: '300px' }} />
              <TableContainer component={Paper} sx={{ boxShadow: 1, borderRadius: 1 }}>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ bgcolor: 'grey.100', fontWeight: 'bold' }}>Mission Name</TableCell>
                      <TableCell sx={{ bgcolor: 'grey.100', fontWeight: 'bold' }}>Fiscal Year</TableCell>
                      <TableCell sx={{ bgcolor: 'grey.100', fontWeight: 'bold' }}>Status</TableCell>
                      <TableCell sx={{ bgcolor: 'grey.100', fontWeight: 'bold' }}>Reports</TableCell>
                      <TableCell sx={{ bgcolor: 'grey.100', fontWeight: 'bold' }}>Price</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {missions.map((mission, index) => (
                      <TableRow
                        key={mission.id}
                        sx={{
                          bgcolor: index % 2 === 0 ? 'background.default' : 'grey.50',
                          '&:hover': { bgcolor: 'grey.100' },
                        }}
                      >
                        <TableCell>{mission.mission_name}</TableCell>
                        <TableCell>{mission.fiscal_year}</TableCell>
                        <TableCell>
                          <Chip
                            label={mission.status}
                            variant="tonal"
                            color={mission.status.toLowerCase() === 'active' ? 'success' : 'error'}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>{mission.number_of_report}</TableCell>
                        <TableCell>${mission.price.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          ) : (
            <Typography>No missions found for this client.</Typography>
          )}
        </div>
        <div className="flex gap-2">
          <OpenDialogOnElementClick element={Button} elementProps={{ variant: 'contained', children: 'Edit Details' }} dialog={EditUserInfo} />
          <Button variant="contained" color="primary" onClick={handleExportClient}>
            Export Client
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default CustomerDetails;

