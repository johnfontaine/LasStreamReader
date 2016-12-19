ssh_key= -i "~/Documents/keys/fontaine-instance.pem"
ssh_host=ec2-user@10.0.103.112
update:
		scp -r $(ssh_key) ./src/*.js $(ssh_host):/mnt/efs/processor/node_modules/LasStreamReader/src/
download:
	scp $(ssh_key) $(ssh_host):/mnt/efs/data/usgs/ARRA-NE_PlatteRiver_2010/ARRA-NE_PlatteRiver_2010_000031.laz tests/sample_data/ARRA-NE_PlatteRiver_2010_000031.laz
