ssh_key= -i "~/Documents/keys/fontaine-instance.pem"
ssh_host=ec2-user@10.0.103.112
update:
		scp -r $(ssh_key) ./src/*.js $(ssh_host):/mnt/efs/processor/node_modules/LasStreamReader/src/
download:
	scp $(ssh_key) $(ssh_host):/mnt/efs/data/usgs/ARRA-MI_4SECounties_2010/ARRA-MI_4SECounties_2010_000011.laz tests/sample_data/ARRA-MI_4SECounties_2010_000011.laz
