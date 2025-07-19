// MUI Imports
import Grid from '@mui/material/Grid2'

// Component Imports
import ProductAddHeader from '@views/apps/ecommerce/products/add/ProductAddHeader'
import ProductInformation from '@views/apps/ecommerce/products/add/ProductInformation'

const eCommerceProductsAdd = () => {
  return (
    <Grid container spacing={6}>
      <Grid xs={12}>
        <ProductAddHeader />
      </Grid>
      <Grid xs={12}>
        <ProductInformation />
      </Grid>
    </Grid>
  )
}

export default eCommerceProductsAdd
