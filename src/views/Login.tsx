'use client'

// React Imports
import { useState } from 'react'

// Next Imports
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'

// MUI Imports
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import Checkbox from '@mui/material/Checkbox'
import Button from '@mui/material/Button'
import FormControlLabel from '@mui/material/FormControlLabel'
import Alert from '@mui/material/Alert'

// Third-party Imports
import { signIn } from 'next-auth/react'
import { Controller, useForm } from 'react-hook-form'
import { valibotResolver } from '@hookform/resolvers/valibot'
import { object, minLength, string, email, pipe, nonEmpty } from 'valibot'
import type { SubmitHandler } from 'react-hook-form'
import type { InferInput } from 'valibot'

// Type Imports
import type { Mode } from '@core/types'
import type { Locale } from '@/configs/i18n'

// Component Imports
import Logo from '@components/layout/shared/Logo'

// Config Imports
import themeConfig from '@configs/themeConfig'

// Util Imports
import { getLocalizedUrl } from '@/utils/i18n'

type ErrorType = {
  message: string[]
}

type FormData = InferInput<typeof schema>

const schema = object({
  email: pipe(string(), minLength(1, 'This field is required'), email('Please enter a valid email address')),
  password: pipe(
    string(),
    nonEmpty('This field is required'),
    minLength(5, 'Password must be at least 5 characters long')
  )
})

const Login = ({ mode }: { mode: Mode }) => {
  // States
  const [isPasswordShown, setIsPasswordShown] = useState(false)
  const [errorState, setErrorState] = useState<ErrorType | null>(null)

  // Hooks
  const router = useRouter()
  const searchParams = useSearchParams()
  const { lang: locale } = useParams()

  const {
    control,
    handleSubmit,
    formState: { errors }
  } = useForm<FormData>({
    resolver: valibotResolver(schema),
    defaultValues: {
      email: 'admin@materialize.com',
      password: 'admin'
    }
  })

  const handleClickShowPassword = () => setIsPasswordShown(show => !show)

  const onSubmit: SubmitHandler<FormData> = async (data: FormData) => {
    try {
      const res = await signIn('credentials', {
        email: data.email,
        password: data.password,
        redirect: false
      })

      if (res && res.ok && res.error === null) {
        const redirectURL = searchParams.get('redirectTo') ?? '/'

        router.replace(getLocalizedUrl(redirectURL, locale as Locale))
      } else if (res?.error) {
        console.error('Sign-in error details:', res.error)
        try {
          if (res.error.startsWith('{') || res.error.startsWith('[')) {
            setErrorState(JSON.parse(res.error))
          } else {
            setErrorState({
              message: [
                res.error === 'CredentialsSignin'
                  ? 'Invalid email or password'
                  : res.error === 'fetch failed'
                    ? 'Unable to connect to authentication server'
                    : res.error || 'Login failed'
              ]
            })
          }
        } catch (parseError) {
          console.error('Error parsing sign-in error:', parseError)
          setErrorState({
            message: [
              res.error === 'CredentialsSignin'
                ? 'Invalid email or password'
                : res.error === 'fetch failed'
                  ? 'Unable to connect to authentication server'
                  : res.error || 'Login failed'
            ]
          })
        }
      }
    } catch (error) {
      console.error('Unexpected error during sign-in:', error)
      setErrorState({ message: ['Unexpected error occurred'] })
    }
  }

  return (
    <div className='flex flex-col justify-center items-center min-bs-[100dvh] p-6'>
      <div className='absolute block-start-5 sm:block-start-[38px] inline-start-6 sm:inline-start-[38px]'>
        <Logo />
      </div>
      <div className='flex flex-col gap-5 is-full max-is-[400px]'>
        <div>
          <Typography variant='h4'>{`Welcome to ${themeConfig.templateName}!👋🏻`}</Typography>
          <Typography>Please sign-in to your account and start the adventure</Typography>
        </div>
        <Alert icon={false} className='bg-[var(--mui-palette-primary-lightOpacity)]'>
          <Typography variant='body2' color='primary.main'>
            Email: <span className='font-medium'>admin@materialize.com</span> / Pass:{' '}
            <span className='font-medium'>admin</span>
          </Typography>
        </Alert>

        <form
          noValidate
          action={() => {}}
          autoComplete='off'
          onSubmit={handleSubmit(onSubmit)}
          className='flex flex-col gap-5'
        >
          <Controller
            name='email'
            control={control}
            rules={{ required: true }}
            render={({ field }) => (
              <TextField
                {...field}
                fullWidth
                autoFocus
                type='email'
                label='Email'
                onChange={e => {
                  field.onChange(e.target.value)
                  errorState !== null && setErrorState(null)
                }}
                {...((errors.email || errorState !== null) && {
                  error: true,
                  helperText: errors?.email?.message || errorState?.message[0]
                })}
              />
            )}
          />
          <Controller
            name='password'
            control={control}
            rules={{ required: true }}
            render={({ field }) => (
              <TextField
                {...field}
                fullWidth
                label='Password'
                id='login-password'
                type={isPasswordShown ? 'text' : 'password'}
                onChange={e => {
                  field.onChange(e.target.value)
                  errorState !== null && setErrorState(null)
                }}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position='end'>
                      <IconButton
                        edge='end'
                        onClick={handleClickShowPassword}
                        onMouseDown={e => e.preventDefault()}
                        aria-label='toggle password visibility'
                      >
                        <i className={isPasswordShown ? 'ri-eye-off-line' : 'ri-eye-line'} />
                      </IconButton>
                    </InputAdornment>
                  )
                }}
                {...(errors.password && { error: true, helperText: errors.password.message })}
              />
            )}
          />
          <div className='flex justify-between items-center flex-wrap gap-x-3 gap-y-1'>
            <FormControlLabel control={<Checkbox defaultChecked />} label='Remember me' />
            <Typography
              className='text-end'
              color='primary'
              component={Link}
              href={getLocalizedUrl('/forgot-password', locale as Locale)}
            >
              Forgot password?
            </Typography>
          </div>
          <Button fullWidth variant='contained' type='submit'>
            Log In
          </Button>
          <div className='flex justify-center items-center flex-wrap gap-2'>
            <Typography>New on our platform?</Typography>
            <Typography component={Link} href={getLocalizedUrl('/register', locale as Locale)} color='primary'>
              Create an account
            </Typography>
          </div>
        </form>
      </div>
    </div>
  )
}

export default Login
