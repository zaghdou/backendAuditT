// MUI Imports
import Grid from '@mui/material/Grid2'

// Components Imports
import CongratulationsJohn from '@views/dashboards/analytics/CongratulationsJohn'
import CardStatVertical from '@components/card-statistics/Vertical'
import LineChart from '@views/dashboards/analytics/LineChart'
import TotalTransactions from '@views/dashboards/analytics/TotalTransactions'
import Performance from '@views/dashboards/analytics/Performance'
import ProjectStatistics from '@views/dashboards/analytics/ProjectStatistics'
import BarChart from '@views/dashboards/analytics/BarChart'
import RadialBarChart from '@views/dashboards/analytics/RadialBarChart'
import SalesCountry from '@views/dashboards/analytics/SalesCountry'
import TopReferralSources from '@views/dashboards/analytics/TopReferralSources'
import WeeklySales from '@views/dashboards/analytics/WeeklySales'
import VisitsByDay from '@views/dashboards/analytics/VisitsByDay'
import ActivityTimeline from '@views/dashboards/analytics/ActivityTimeline'

// Server Action Imports
import { getServerMode } from '@core/utils/serverHelpers'

const DashboardAnalytics = async () => {
  // Vars
  const serverMode = await getServerMode()

  return (
    <Grid container spacing={6}>
      <Grid size={{ xs: 12, md: 8 }}>
        <CongratulationsJohn serverMode={serverMode} />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, md: 2 }}>
        <CardStatVertical
          stats='155k'
          avatarColor='primary'
          trendNumber='22%'
          title='Total Orders'
          chipText='Last 4 Month'
          avatarIcon='ri-shopping-cart-line'
          avatarSkin='light'
          chipColor='secondary'
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, md: 2 }}>
        <LineChart />
      </Grid>
      <Grid size={{ xs: 12, md: 8 }}>
        <TotalTransactions />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, md: 4 }}>
        <Performance />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, md: 4 }}>
        <ProjectStatistics serverMode={serverMode} />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, md: 4 }}>
        <Grid container spacing={6}>
          <Grid size={{ xs: 6 }}>
            <BarChart />
          </Grid>
          <Grid size={{ xs: 6 }}>
            <CardStatVertical
              stats='$13.4k'
              avatarColor='success'
              trendNumber='38%'
              title='Total Sales'
              chipText='Last Six Month'
              avatarIcon='ri-handbag-line'
              avatarSkin='light'
              chipColor='secondary'
            />
          </Grid>
          <Grid size={{ xs: 6 }}>
            <CardStatVertical
              stats='142.8k'
              avatarColor='info'
              trendNumber='62%'
              title='Total Impression'
              chipText='Last One Month'
              avatarIcon='ri-link'
              avatarSkin='light'
              chipColor='secondary'
            />
          </Grid>
          <Grid size={{ xs: 6 }}>
            <RadialBarChart />
          </Grid>
        </Grid>
      </Grid>
      <Grid size={{ xs: 12, sm: 6, md: 4 }}>
        <SalesCountry />
      </Grid>
      <Grid size={{ xs: 12, md: 8 }}>
        <TopReferralSources />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, md: 4 }}>
        <WeeklySales />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, md: 4 }}>
        <VisitsByDay />
      </Grid>
      <Grid size={{ xs: 12, md: 8 }}>
        <ActivityTimeline />
      </Grid>
    </Grid>
  )
}

export default DashboardAnalytics
