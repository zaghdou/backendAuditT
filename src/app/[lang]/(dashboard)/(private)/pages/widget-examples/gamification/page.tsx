// MUI Imports
import Grid from '@mui/material/Grid2'

// Components Imports
import Award from '@views/pages/widget-examples/gamification/Award'
import UpgradeAccount from '@views/pages/widget-examples/gamification/UpgradeAccount'
import CongratulationsJohn from '@views/pages/widget-examples/gamification/CongratulationsJohn'
import CongratulationsDaisy from '@views/pages/widget-examples/gamification/CongratulationsDaisy'

// Server Action Imports
import { getServerMode } from '@core/utils/serverHelpers'

const Statistics = async () => {
  // Vars
  const serverMode = await getServerMode()

  return (
    <Grid container spacing={6}>
      <Grid size={{ xs: 12, md: 4 }}>
        <Award />
      </Grid>
      <Grid size={{ xs: 12, md: 8 }}>
        <CongratulationsJohn serverMode={serverMode} />
      </Grid>
      <Grid size={{ xs: 12, md: 8 }}>
        <CongratulationsDaisy serverMode={serverMode} />
      </Grid>
      <Grid size={{ xs: 12, md: 4 }}>
        <UpgradeAccount />
      </Grid>
    </Grid>
  )
}

export default Statistics
