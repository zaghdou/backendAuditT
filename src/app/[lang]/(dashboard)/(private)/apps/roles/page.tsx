// Component Imports
import Roles from '@views/apps/roles/MissionDashboard'

// On supprime l'import de la Server Action car nous n'en avons plus besoin
// import { getUserData } from '@/app/server/actions'

const RolesApp = () => {
  // On supprime la récupération de données ici.
  // Le composant <Roles /> va maintenant gérer lui-même ses propres données.
  // La page n'a plus besoin d'être `async`.

  // On rend le composant <Roles /> sans lui passer de props.
  return <Roles />
}

export default RolesApp
