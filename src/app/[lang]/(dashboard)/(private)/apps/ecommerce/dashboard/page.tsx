// MUI Imports
import Grid from '@mui/material/Grid2';

// Components Imports
import Sales from '@views/dashboards/ecommerce/Sales';

const DashboardECommerce = async () => {
  return (
    <Grid container spacing={6}>
      <Grid item xs={12} md={6}>
        <Sales />
      </Grid>
    </Grid>
  );
};

export default DashboardECommerce;
