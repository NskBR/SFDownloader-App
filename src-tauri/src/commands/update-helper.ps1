param([Parameter(Mandatory=$true)][string]$ConfigPath)
$ErrorActionPreference = 'Stop'
$config = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
try {
    Add-Type -AssemblyName PresentationFramework
    [xml]$markup = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" Width="400" SizeToContent="Height" WindowStartupLocation="CenterScreen" WindowStyle="None" ResizeMode="NoResize" FontFamily="Segoe UI" UseLayoutRounding="True" Background="#12151B" Foreground="#F4F6FA" Title="Atualização — SFDownloader">
 <Border BorderBrush="#34404B" BorderThickness="1" CornerRadius="16" Padding="32,28">
  <StackPanel>
   <Grid Width="112" Height="112" Margin="0,4,0,24">
    <Ellipse Margin="14" Fill="#1002ADFD" Stroke="#209A1EFC" StrokeThickness="1"/>
    <Ellipse Margin="6" Stroke="#409A1EFC" StrokeThickness="1" StrokeDashArray="42 180"/>
    <Ellipse Name="Ring" StrokeThickness="2" StrokeDashArray="48 18 8 100" StrokeDashCap="Round" RenderTransformOrigin="0.5,0.5"><Ellipse.Stroke><LinearGradientBrush StartPoint="0,0" EndPoint="1,1"><GradientStop Color="#02ADFD" Offset="0"/><GradientStop Color="#9A1EFC" Offset="1"/></LinearGradientBrush></Ellipse.Stroke><Ellipse.RenderTransform><RotateTransform/></Ellipse.RenderTransform></Ellipse>
    <Viewbox Width="48" Height="56"><Canvas Name="Logo" Width="752" Height="806"/></Viewbox>
   </Grid>
   <TextBlock Name="Status" Text="Verificando atualização…" FontSize="20" FontWeight="SemiBold" TextWrapping="Wrap" TextAlignment="Center"/>
   <TextBlock Name="Detail" Text="Seus arquivos serão preservados." FontSize="13" LineHeight="20" Opacity="0.7" TextWrapping="Wrap" TextAlignment="Center" Margin="0,10,0,18"/>
   <ProgressBar Name="Progress" Height="4" IsIndeterminate="True" Foreground="#06B6D4" Background="#263743" BorderThickness="0"/>
   <Button Name="Close" Content="Fechar" Visibility="Collapsed" HorizontalAlignment="Center" Padding="20,8" Background="#202530" Foreground="#F4F6FA" BorderBrush="#34404B" Margin="0,18,0,0"/>
  </StackPanel>
 </Border>
</Window>
'@
    $window = [Windows.Markup.XamlReader]::Load((New-Object System.Xml.XmlNodeReader $markup))
    $status = $window.FindName('Status'); $detail = $window.FindName('Detail')
    $ring = $window.FindName('Ring'); $progress = $window.FindName('Progress')
    $logo = $window.FindName('Logo'); $close = $window.FindName('Close')
    $window.Background = [Windows.Media.BrushConverter]::new().ConvertFromString($config.background)
    $window.Foreground = [Windows.Media.BrushConverter]::new().ConvertFromString($config.foreground)
    $progress.Foreground = [Windows.Media.BrushConverter]::new().ConvertFromString($config.accent)
    [xml]$svg = Get-Content -LiteralPath $config.logo -Raw -Encoding UTF8
    $brandBrush = New-Object Windows.Media.LinearGradientBrush
    $brandBrush.MappingMode = [Windows.Media.BrushMappingMode]::Absolute
    $brandBrush.StartPoint = [Windows.Point]::new(450,250)
    $brandBrush.EndPoint = [Windows.Point]::new(558.4739,1024.8137)
    foreach ($stop in $svg.SelectNodes('//*[local-name()="stop"]')) {
        $color = [Windows.Media.ColorConverter]::ConvertFromString($stop.GetAttribute('stop-color'))
        $offset = [double]::Parse($stop.GetAttribute('offset'), [Globalization.CultureInfo]::InvariantCulture)
        $brandBrush.GradientStops.Add([Windows.Media.GradientStop]::new($color,$offset))
    }
    foreach ($node in $svg.SelectNodes('//*[local-name()="path"]')) {
        $shape = New-Object Windows.Shapes.Path
        $shape.Data = [Windows.Media.Geometry]::Parse($node.GetAttribute('d'))
        $shape.Fill = $brandBrush
        $shape.RenderTransform = New-Object Windows.Media.TranslateTransform(-282,-228)
        $null = $logo.Children.Add($shape)
    }
    $animation = New-Object Windows.Media.Animation.DoubleAnimation(0,360,[Windows.Duration]::new([TimeSpan]::FromSeconds(4)))
    $animation.RepeatBehavior = [Windows.Media.Animation.RepeatBehavior]::Forever
    $ring.RenderTransform.BeginAnimation([Windows.Media.RotateTransform]::AngleProperty,$animation)
    $close.Add_Click({ $window.Close() })
    $script:stage = 'verify'; $script:installerProcess = $null
    $timer = New-Object Windows.Threading.DispatcherTimer
    $timer.Interval = [TimeSpan]::FromMilliseconds(250)
    $deadline = [DateTime]::UtcNow.AddMinutes(3)
    $timer.Add_Tick({
      try {
        if ($script:stage -eq 'verify') {
            if ((Get-FileHash -LiteralPath $config.installer -Algorithm SHA256).Hash -ne $config.sha256) { throw 'A verificação do instalador falhou.' }
            [IO.File]::WriteAllText($config.ready, 'ready')
            $status.Text = 'Preparando atualização…'
            $script:stage = 'wait'
        } elseif ($script:stage -eq 'wait') {
            if (-not (Test-Path -LiteralPath $config.go)) {
                if ([DateTime]::UtcNow -gt $deadline) { throw 'A preparação não terminou. O aplicativo foi preservado.' }
                return
            }
            if (Get-Process -Id $config.parent -ErrorAction SilentlyContinue) { return }
            $status.Text = 'Instalando atualização…'
            $detail.Text = 'O aplicativo abrirá ao concluir.'
            $script:installerProcess = Start-Process -FilePath $config.installer -ArgumentList ('/S /UPDATE /D=' + $config.destination) -WindowStyle Hidden -PassThru
            $script:stage = 'install'
        } elseif ($script:stage -eq 'install' -and $script:installerProcess.HasExited) {
            if ($script:installerProcess.ExitCode -notin @(0,3010)) { throw ('A instalação falhou (código ' + $script:installerProcess.ExitCode + '). Seus downloads foram mantidos.') }
            $status.Text = 'Abrindo aplicativo…'
            $null = Start-Process -FilePath $config.executable -PassThru
            $timer.Stop(); $window.Close()
        }
      } catch {
        $timer.Stop()
        [IO.File]::WriteAllText($config.error, $_.Exception.Message)
        $status.Text = 'Não foi possível atualizar'
        $detail.Text = $_.Exception.Message
        $progress.IsIndeterminate = $false
        $close.Visibility = 'Visible'
      }
    })
    $window.Add_ContentRendered({ $timer.Start() })
    $null = $window.ShowDialog()
} catch { [IO.File]::WriteAllText($config.error, $_.Exception.Message); exit 1 }
