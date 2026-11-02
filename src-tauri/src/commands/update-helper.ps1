param([Parameter(Mandatory=$true)][string]$ConfigPath)
$ErrorActionPreference = 'Stop'
$config = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
try {
    Add-Type -AssemblyName PresentationFramework
    # This process owns the update window after the application exits.
    Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
public static class SFUpdateIdentity {
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    public static extern int SetCurrentProcessExplicitAppUserModelID(string appID);
}
'@
    $null = [SFUpdateIdentity]::SetCurrentProcessExplicitAppUserModelID('SFDownloader.Update')
    [xml]$markup = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" Width="440" SizeToContent="Height" WindowStartupLocation="CenterScreen" WindowStyle="None" ResizeMode="NoResize" FontFamily="Segoe UI" UseLayoutRounding="True" AllowsTransparency="True" Background="Transparent" Foreground="#F4F6FA" ShowInTaskbar="True" Title="Atualização — SFDownloader">
 <Border Name="Shell" Background="#161A1E" BorderBrush="#34404B" BorderThickness="1" CornerRadius="18" Padding="28">
  <StackPanel>
   <Grid Margin="0,0,0,24"><TextBlock Text="SFDownloader" FontSize="13" FontWeight="SemiBold"/><TextBlock Text="Atualização" HorizontalAlignment="Right" FontSize="12" Opacity="0.65"/></Grid>
   <Grid Width="112" Height="112" Margin="0,4,0,24">
    <Border Margin="20" CornerRadius="22" Background="#162D3744" BorderBrush="#30446C91" BorderThickness="1" RenderTransformOrigin="0.5,0.5"><Border.RenderTransform><RotateTransform Angle="-10"/></Border.RenderTransform></Border>
    <Ellipse Name="Ring" StrokeThickness="2" StrokeDashArray="48 18 8 100" StrokeDashCap="Round" RenderTransformOrigin="0.5,0.5"><Ellipse.Stroke><LinearGradientBrush StartPoint="0,0" EndPoint="1,1"><GradientStop Color="#02ADFD" Offset="0"/><GradientStop Color="#9A1EFC" Offset="1"/></LinearGradientBrush></Ellipse.Stroke><Ellipse.RenderTransform><RotateTransform/></Ellipse.RenderTransform></Ellipse>
    <Viewbox Width="48" Height="56"><Canvas Name="Logo" Width="752" Height="806"/></Viewbox>
   </Grid>
   <TextBlock Name="Status" Text="Verificando atualização…" FontSize="20" FontWeight="SemiBold" TextWrapping="Wrap" TextAlignment="Center"/>
   <TextBlock Name="Detail" Text="Seus arquivos serão preservados." FontSize="13" LineHeight="20" Opacity="0.8" TextWrapping="Wrap" TextAlignment="Center" Margin="0,10,0,24"/>
   <ProgressBar Name="Progress" Height="4" IsIndeterminate="True" Foreground="#06B6D4" Background="#263743" BorderThickness="0"/>
   <TextBlock Name="Footnote" Text="Mantenha esta janela aberta até concluir." FontSize="11" Opacity="0.6" TextAlignment="Center" Margin="0,16,0,0"/>
   <Button Name="Close" Content="Fechar" Visibility="Collapsed" HorizontalAlignment="Center" Padding="20,8" Background="#202530" Foreground="#F4F6FA" BorderBrush="#34404B" Margin="0,18,0,0"/>
  </StackPanel>
 </Border>
</Window>
'@
    $window = [Windows.Markup.XamlReader]::Load((New-Object System.Xml.XmlNodeReader $markup))
    $status = $window.FindName('Status'); $detail = $window.FindName('Detail')
    $ring = $window.FindName('Ring'); $progress = $window.FindName('Progress')
    $logo = $window.FindName('Logo'); $close = $window.FindName('Close')
    $window.FindName('Shell').Background = [Windows.Media.BrushConverter]::new().ConvertFromString($config.background)
    $icon = [Windows.Media.Imaging.BitmapFrame]::Create([Uri]::new($config.icon), [Windows.Media.Imaging.BitmapCreateOptions]::PreservePixelFormat, [Windows.Media.Imaging.BitmapCacheOption]::OnLoad)
    $icon.Freeze()
    $window.Icon = $icon
    $window.Add_MouseLeftButtonDown({ if ($_.ChangedButton -eq [Windows.Input.MouseButton]::Left) { $window.DragMove() } })
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
    $script:cleanupAttempts = 0
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
            $status.Text = 'Finalizando atualização…'
            $script:stage = 'cleanup'
        } elseif ($script:stage -eq 'cleanup') {
            # Only direct installer files in this application's update cache are eligible.
            # Never recurse into other folders or remove the installed executable.
            $cache = [IO.Path]::GetFullPath([IO.Path]::GetDirectoryName($config.installer))
            if ([IO.Path]::GetFileName($cache) -ne 'updates') { throw 'Pasta de atualização inválida.' }
            $current = [IO.Path]::GetFullPath($config.installer)
            $remaining = $false
            foreach ($file in (Get-ChildItem -LiteralPath $cache -File)) {
                if ($file.Attributes -band [IO.FileAttributes]::ReparsePoint) { continue }
                if ($file.FullName -ne $current -and $file.Name -notmatch '^SFDownloader_[0-9]+\.[0-9]+\.[0-9]+(?:[-+][a-zA-Z0-9.-]+)?_x64-setup\.exe$') { continue }
                if ($file.FullName -eq [IO.Path]::GetFullPath($config.executable)) { continue }
                try { Remove-Item -LiteralPath $file.FullName -Force -ErrorAction Stop } catch { $remaining = $true }
            }
            $script:cleanupAttempts++
            # NSIS can keep its file locked briefly after its parent exits.
            if ($remaining -and $script:cleanupAttempts -lt 20) { return }
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
        $progress.Visibility = 'Collapsed'
        $window.FindName('Footnote').Visibility = 'Collapsed'
        $close.Visibility = 'Visible'
      }
    })
    $window.Add_ContentRendered({ $timer.Start() })
    $null = $window.ShowDialog()
} catch { [IO.File]::WriteAllText($config.error, $_.Exception.Message); exit 1 }
