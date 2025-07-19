// React Imports
import { useState, useEffect } from 'react'

// MUI Imports
import Grid from '@mui/material/Grid2'
import CardContent from '@mui/material/CardContent'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'

// Type Imports
import type { ProductType } from '@/types/apps/ecommerceTypes'

const TableFilters = ({
  setData,
  productData
}: {
  setData: (data: ProductType[]) => void
  productData?: ProductType[]
}) => {
  // State pour le type de bibliothèque
  const [libraryType, setLibraryType] = useState('')

  useEffect(() => {
    const filteredData = productData?.filter(product => {
      if (libraryType && product.type !== libraryType) return false
      return true
    })

    setData(filteredData ?? [])
  }, [libraryType, productData, setData])

  return (
    <CardContent>
      <Grid container spacing={6}>
        <Grid xs={12} sm={6}>
          <FormControl fullWidth>
            <InputLabel id='library-type-select'>Type de bibliothèque</InputLabel>
            <Select
              fullWidth
              id='select-library-type'
              value={libraryType}
              onChange={e => setLibraryType(e.target.value)}
              label='Type de bibliothèque'
              labelId='library-type-select'
            >
              <MenuItem value=''>Tous les types</MenuItem>
              <MenuItem value='ISAE3402'>ISAE3402</MenuItem>
              <MenuItem value='SOC 2'>SOC 2</MenuItem>
            </Select>
          </FormControl>
        </Grid>
      </Grid>
    </CardContent>
  )
}

export default TableFilters
